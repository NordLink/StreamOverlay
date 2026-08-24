public class ChattersAggregatorService
{
    private readonly IOverlayBroadcastService _broadcast;
    private readonly ILogger<ChattersAggregatorService> _logger;

    private readonly object _lock = new();

    private readonly Dictionary<string, DateTime> _firstSeen =
        new(StringComparer.OrdinalIgnoreCase);

    private readonly Dictionary<string, ChattersInfoDto> _viewers =
        new(StringComparer.OrdinalIgnoreCase);

    public ChattersAggregatorService(
        IOverlayBroadcastService broadcast,
        ILogger<ChattersAggregatorService> logger)
    {
        _broadcast = broadcast;
        _logger = logger;
    }

    public async Task UpdatePlatformChattersAsync(
        string platform,
        List<ChattersInfoDto> chatters,
        CancellationToken ct)
    {
        List<ChattersInfoDto> joined;
        List<ChattersInfoDto> left;

        lock (_lock)
        {
            var now = DateTime.UtcNow;

            foreach (var chatter in chatters)
            {
                var key = GetKey(chatter);

                if (!_firstSeen.TryGetValue(
                        key,
                        out var detectedAt))
                {
                    detectedAt = now;
                    _firstSeen[key] = detectedAt;
                }

                chatter.DetectedAt = detectedAt;
            }

            var incoming = chatters
                .ToDictionary(
                    GetKey,
                    x => x,
                    StringComparer.OrdinalIgnoreCase);

            var previous = _viewers
                .Where(x =>
                    x.Value.Platform.Equals(
                        platform,
                        StringComparison.OrdinalIgnoreCase))
                .ToDictionary(
                    x => x.Key,
                    x => x.Value,
                    StringComparer.OrdinalIgnoreCase);

            // Новые
            joined = incoming
                .Where(x => !previous.ContainsKey(x.Key))
                .Select(x => x.Value)
                .ToList();

            // Вышедшие
            left = previous
                .Where(x => !incoming.ContainsKey(x.Key))
                .Select(x => x.Value)
                .ToList();

            foreach (var key in previous.Keys)
            {
                _viewers.Remove(key);
            }

            foreach (var chatter in chatters)
            {
                _viewers[GetKey(chatter)] = chatter;
            }

            foreach (var viewer in left)
            {
                _firstSeen.Remove(GetKey(viewer));
            }
        }

        foreach (var viewer in joined)
        {
            await _broadcast.SendChatterJoinedAsync(
                new OverlayChatterInfoDto(
                    viewer.UserId,
                    viewer.Login,
                    viewer.DisplayName,
                    viewer.Platform,
                    viewer.DetectedAt),
                ct);
        }

        foreach (var viewer in left)
        {
            await _broadcast.SendChatterLeftAsync(
                new OverlayChatterLeftDto(
                    viewer.UserId,
                    viewer.Login,
                    viewer.Platform),
                ct);
        }
    }

    public IReadOnlyList<ChattersInfoDto> GetViewers()
    {
        lock (_lock)
        {
            return _viewers.Values
                .OrderByDescending(x => x.DetectedAt)
                .ToList();
        }
    }

    private static string GetKey(ChattersInfoDto chatter)
    {
        return $"{chatter.Platform}:{chatter.UserId}";
    }
}