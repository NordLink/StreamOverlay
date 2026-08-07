using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

public class TwitchViewerService : BackgroundService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly TwitchAuthService _authService;
    private readonly TwitchOptions _options;
    private readonly ILogger<TwitchViewerService> _logger;

    private readonly TimeSpan _chattersRefreshInterval = TimeSpan.FromSeconds(30);

    private string? _broadcasterId;
    private string? _moderatorId;

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

    private class ViewerInfo
    {
        public string Login { get; init; } = "";
        public string DisplayName { get; init; } = "";
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

                PrintTable(viewers);
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

        _logger.LogInformation(
            "Загружено {Count} chatters.",
            result.Count);

        return result;
    }

    private void PrintTable(List<ViewerInfo> viewers)
    {
        Console.WriteLine();

        Console.WriteLine(
            $"Участники чата: {viewers.Count}");

        Console.WriteLine();

        Console.WriteLine(
            "{0,-25}",
            "Никнейм");

        Console.WriteLine(
            new string('-', 25));


        foreach (var viewer in viewers)
        {
            Console.WriteLine(
                "{0,-25}",
                viewer.DisplayName);
        }

        Console.WriteLine();
    }
}