using Microsoft.Extensions.Options;

public class VkChatPollingService : BackgroundService
{
    private readonly IVkLiveApiClient _vkClient;
    private readonly IOverlayBroadcastService _broadcast;
    private readonly VkLiveOptions _options;
    private readonly ILogger<VkChatPollingService> _logger;

    private readonly HashSet<long> _seenMessageIds = new();
    private readonly Queue<long> _seenOrder = new();

    private const int MaxRememberedIds = 1000;

    // Момент запуска сервиса.
    // Сообщения, созданные ДО этого момента, считаются историей.
    private readonly long _serviceStartedAt =
        DateTimeOffset.UtcNow.ToUnixTimeSeconds();

    private bool _initialized;

    private static readonly string[] VkColorPalette =
    {
        "#D66E34",
        "#B8AAFF",
        "#1D90FF",
        "#9961F9",
        "#59A840",
        "#E73629",
        "#DE6489",
        "#20BBA1",
        "#F8B301",
        "#0099BB",
        "#7BBEFF",
        "#E542FF",
        "#A36C59",
        "#8BA259",
        "#00A9FF",
        "#A20BFF"
    };

    public VkChatPollingService(
        IVkLiveApiClient vkClient,
        IOverlayBroadcastService broadcast,
        IOptions<VkLiveOptions> options,
        ILogger<VkChatPollingService> logger)
    {
        _vkClient = vkClient;
        _broadcast = broadcast;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(
        CancellationToken stoppingToken)
    {
        if (string.IsNullOrWhiteSpace(_options.ChannelUrl))
        {
            _logger.LogWarning(
                "VK channel не задан. VkChatPollingService остановлен.");

            return;
        }

        await _broadcast.SendChannelInfoAsync(
            new OverlayChannelInfoDto(
                "vk",
                _options.ChannelUrl,
                _options.ChannelUrl),
            stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PollMessagesAsync(stoppingToken);
            }
            catch (OperationCanceledException)
                when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Ошибка в VkChatPollingService.");
            }

            await Task.Delay(
                TimeSpan.FromSeconds(
                    _options.ChatPollingSeconds),
                stoppingToken);
        }
    }

    private async Task PollMessagesAsync(
        CancellationToken ct)
    {
        var response =
            await _vkClient.GetMessagesAsync(50, ct);

        var messages =
            response?.Data?.ChatMessages;

        if (messages is null || messages.Count == 0)
            return;

        var ordered = messages
            .Where(x => x is not null)
            .OrderBy(x => x.CreatedAt)
            .ThenBy(x => x.Id)
            .ToList();

        if (!_initialized)
        {
            foreach (var message in ordered)
            {
                if (message.Id <= 0)
                    continue;

                // Старые сообщения.
                if (message.CreatedAt < _serviceStartedAt)
                {
                    RememberId(message.Id);
                }
            }

            _initialized = true;

            _logger.LogInformation(
                "VK chat initialized. История сохранена без отправки в overlay.");
        }

        foreach (var message in ordered)
        {
            if (message.Id <= 0)
                continue;

            if (_seenMessageIds.Contains(message.Id))
                continue;

            var user =
                string.IsNullOrWhiteSpace(message.Author?.Nick)
                    ? "VK User"
                    : message.Author!.Nick!;

            var (text, emoteList) =
                ProcessMessageParts(message.Parts);

            if (string.IsNullOrWhiteSpace(text) &&
                emoteList.Count == 0)
            {
                text = "[empty]";
            }

            var color =
                GetColorFromPalette(
                    message.Author?.NickColor);

            var sendTime =
                DateTimeOffset
                    .FromUnixTimeSeconds(message.CreatedAt)
                    .ToOffset(TimeSpan.FromHours(3))
                    .ToString("HH:mm");

            await _broadcast.SendChatMessageAsync(
                new OverlayChatMessageDto(
                    Platform: "vk",
                    User: user,
                    Message: text,
                    Color: color,
                    Emotes: emoteList,
                    SendTime: sendTime
                ),
                ct);

            RememberId(message.Id);
        }
    }

    private static (
        string Text,
        List<OverlayEmoteDto> Emotes)
        ProcessMessageParts(List<VkPart>? parts)
    {
        var textChunks = new List<string>();
        var emotes = new List<OverlayEmoteDto>();

        if (parts != null)
        {
            foreach (var part in parts)
            {
                // Обычный текст
                if (!string.IsNullOrWhiteSpace(
                    part.Text?.Content))
                {
                    textChunks.Add(
                        part.Text.Content);
                }

                // Эмодзи
                else if (part.Smile != null)
                {
                    var url =
                        part.Smile.LargeUrl ??
                        part.Smile.MediumUrl ??
                        part.Smile.SmallUrl ??
                        "";

                    emotes.Add(
                        new OverlayEmoteDto(
                            part.Smile.Id ?? "0",
                            part.Smile.Name ?? "smile",
                            url));

                    textChunks.Add(
                        " " +
                        (part.Smile.Name ?? "smile") +
                        " ");
                }

                // Упоминание
                else if (part.Mention?.Nick != null)
                {
                    textChunks.Add(
                        " @" +
                        part.Mention.Nick +
                        " ");
                }

                // Ссылка
                else if (part.Link != null)
                {
                    var linkContent =
                        !string.IsNullOrWhiteSpace(
                            part.Link.Content)
                            ? part.Link.Content
                            : part.Link.Url;

                    if (!string.IsNullOrWhiteSpace(
                        linkContent))
                    {
                        textChunks.Add(linkContent);
                    }
                }
            }
        }

        return (
            string.Join(
                " ",
                textChunks.Where(
                    c => !string.IsNullOrWhiteSpace(c))),
            emotes
        );
    }

    private void RememberId(long id)
    {
        if (_seenMessageIds.Add(id))
        {
            _seenOrder.Enqueue(id);
        }

        while (_seenOrder.Count > MaxRememberedIds)
        {
            var oldest = _seenOrder.Dequeue();

            _seenMessageIds.Remove(oldest);
        }
    }

    private static string? GetColorFromPalette(
        int? colorIndex)
    {
        if (colorIndex is null ||
            colorIndex < 0 ||
            colorIndex >= VkColorPalette.Length)
        {
            return null;
        }

        return VkColorPalette[colorIndex.Value];
    }
}