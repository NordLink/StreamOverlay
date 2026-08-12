using Microsoft.Extensions.Options;
using System.Net.Http.Headers;
using System.Text.Json;

public class TwitchViewerService : BackgroundService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly TwitchAuthService _authService;
    private readonly TwitchOptions _options;
    private readonly ILogger<TwitchViewerService> _logger;

    private readonly TimeSpan _chattersRefreshInterval = TimeSpan.FromSeconds(30);

    private readonly Dictionary<string, DateTime> _chatterFirstSeen = new();

    private string? _broadcasterId;
    private string? _moderatorId;
    private List<ViewerInfo> _viewers = new();
    private readonly object _viewersLock = new();

    public TwitchViewerService(
        IHttpClientFactory httpClientFactory,
        TwitchAuthService authService,
        IOptions<TwitchOptions> options,
        ILogger<TwitchViewerService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _authService = authService;
        _options = options.Value;
        _logger = logger;
    }

    public class ViewerInfo
    {
        public string Login { get; init; } = "";
        public string DisplayName { get; init; } = "";
        public DateTime DetectedAt { get; set; }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (string.IsNullOrWhiteSpace(_options.WatchChannel))
        {
            _logger.LogWarning("WATCH_CHANNEL не настроен.");
            return;
        }

        _logger.LogInformation(
            "TwitchViewerService запущен для канала {Channel}",
            _options.WatchChannel);

        _broadcasterId = await ResolveUserIdAsync(
            _options.WatchChannel,
            stoppingToken);

        if (_broadcasterId == null)
        {
            _logger.LogError("Не удалось определить broadcaster id.");
            return;
        }

        _moderatorId = await ResolveCurrentUserIdAsync(stoppingToken);

        if (_moderatorId == null)
        {
            _logger.LogError("Не удалось определить moderator id.");
            return;
        }

        _logger.LogInformation(
            "BroadcasterId={BroadcasterId} ModeratorId={ModeratorId}",
            _broadcasterId,
            _moderatorId);

        DateTime lastSubscribersUpdate = DateTime.MinValue;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var viewers = await GetChattersAsync(stoppingToken);

                UpdateChatterTimes(viewers);

                var sortedViewers = viewers
                    .OrderByDescending(x => _chatterFirstSeen[x.Login])
                    .ToList();

                lock (_viewersLock)
                {
                    _viewers = sortedViewers;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Ошибка ViewerService");
            }

            await Task.Delay(
                _chattersRefreshInterval,
                stoppingToken);
        }
    }

    private void UpdateChatterTimes(List<ViewerInfo> chatters)
    {
        var now = DateTime.UtcNow;

        foreach (var chatter in chatters)
        {
            if (!_chatterFirstSeen.ContainsKey(chatter.Login))
            {
                _chatterFirstSeen[chatter.Login] = now;
            }

            chatter.DetectedAt = _chatterFirstSeen[chatter.Login];
        }

        var currentLogins = chatters
            .Select(x => x.Login)
            .ToHashSet();

        var disappeared = _chatterFirstSeen.Keys
            .Where(login => !currentLogins.Contains(login))
            .ToList();

        foreach (var login in disappeared)
        {
            _chatterFirstSeen.Remove(login);
        }
    }

    private async Task<string?> ResolveUserIdAsync(
        string login,
        CancellationToken ct)
    {
        var token = await _authService.GetClientCredentialsAsync(ct);

        if (token == null)
            return null;

        var http = _httpClientFactory.CreateClient();

        using var req = new HttpRequestMessage(
            HttpMethod.Get,
            $"https://api.twitch.tv/helix/users?login={login}");

        req.Headers.Add("Client-Id", _options.ClientId);

        req.Headers.Authorization =
            new AuthenticationHeaderValue(
                "Bearer",
                token.AccessToken);

        using var resp = await http.SendAsync(req, ct);

        if (!resp.IsSuccessStatusCode)
            return null;

        using var doc = JsonDocument.Parse(
            await resp.Content.ReadAsStringAsync(ct));

        var data = doc.RootElement.GetProperty("data");

        if (data.GetArrayLength() == 0)
            return null;

        return data[0]
            .GetProperty("id")
            .GetString();
    }

    public IReadOnlyList<ViewerInfo> GetViewers()
    {
        lock (_viewersLock)
        {
            return _viewers.ToList();
        }
    }

    private async Task<string?> ResolveCurrentUserIdAsync(
        CancellationToken ct)
    {
        var token = await _authService.GetUserAccessTokenAsync(ct);

        if (token == null)
            return null;

        var http = _httpClientFactory.CreateClient();

        using var req = new HttpRequestMessage(
            HttpMethod.Get,
            "https://api.twitch.tv/helix/users");

        req.Headers.Add("Client-Id", _options.ClientId);

        req.Headers.Authorization =
            new AuthenticationHeaderValue(
                "Bearer",
                token.AccessToken);

        using var resp = await http.SendAsync(req, ct);

        if (!resp.IsSuccessStatusCode)
            return null;

        using var doc = JsonDocument.Parse(
            await resp.Content.ReadAsStringAsync(ct));

        var data = doc.RootElement.GetProperty("data");

        if (data.GetArrayLength() == 0)
            return null;

        return data[0]
            .GetProperty("id")
            .GetString();
    }

    private async Task<List<ViewerInfo>> GetChattersAsync(CancellationToken ct)
    {
        var result = new List<ViewerInfo>();

        var token = await _authService.GetUserAccessTokenAsync(ct);

        if (token == null)
            return result;

        var http = _httpClientFactory.CreateClient();

        string? cursor = null;

        do
        {
            var url =
                $"https://api.twitch.tv/helix/chat/chatters" +
                $"?broadcaster_id={_broadcasterId}" +
                $"&moderator_id={_moderatorId}" +
                $"&first=100";

            if (!string.IsNullOrWhiteSpace(cursor))
                url += $"&after={cursor}";

            using var req = new HttpRequestMessage(
                HttpMethod.Get,
                url);

            req.Headers.Add("Client-Id", _options.ClientId);

            req.Headers.Authorization =
                new AuthenticationHeaderValue(
                    "Bearer",
                    token.AccessToken);

            using var resp = await http.SendAsync(req, ct);

            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "GetChatters failed: {Status}",
                    resp.StatusCode);

                return result;
            }

            using var doc = JsonDocument.Parse(
                await resp.Content.ReadAsStringAsync(ct));

            foreach (var chatter in
                     doc.RootElement
                        .GetProperty("data")
                        .EnumerateArray())
            {
                result.Add(new ViewerInfo
                {
                    Login = chatter
                        .GetProperty("user_login")
                        .GetString() ?? "",

                    DisplayName = chatter
                        .GetProperty("user_name")
                        .GetString() ?? ""
                });
            }

            cursor = null;

            if (doc.RootElement.TryGetProperty(
                    "pagination",
                    out var pagination))
            {
                if (pagination.TryGetProperty(
                        "cursor",
                        out var cursorElement))
                {
                    cursor = cursorElement.GetString();
                }
            }

        } while (!string.IsNullOrWhiteSpace(cursor));

        return result;
    }

}