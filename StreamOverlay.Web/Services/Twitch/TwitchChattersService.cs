using Microsoft.Extensions.Options;
using System.Net.Http.Headers;
using System.Text.Json;

public class TwitchChattersService : BackgroundService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly TwitchAuthService _authService;
    private readonly TwitchOptions _options;
    private readonly ILogger<TwitchChattersService> _logger;

    private readonly ChattersAggregatorService _chattersAggregator;

    private readonly TimeSpan _chattersRefreshInterval = TimeSpan.FromSeconds(30);

    private string? _broadcasterId;
    private string? _moderatorId;

    public TwitchChattersService(
     IHttpClientFactory httpClientFactory,
     TwitchAuthService authService,
     IOptions<TwitchOptions> options,
     ILogger<TwitchChattersService> logger,
     ChattersAggregatorService chattersAggregator)
    {
        _httpClientFactory = httpClientFactory;
        _authService = authService;
        _options = options.Value;
        _logger = logger;
        _chattersAggregator = chattersAggregator;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (string.IsNullOrWhiteSpace(_options.WatchChannel))
        {
            _logger.LogWarning("WATCH_CHANNEL не настроен.");
            return;
        }

        _logger.LogInformation("TwitchViewerService запущен для канала {Channel}", _options.WatchChannel);

        _broadcasterId = await ResolveUserIdAsync(_options.WatchChannel,stoppingToken);

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

        _logger.LogInformation("BroadcasterId={BroadcasterId} ModeratorId={ModeratorId}", _broadcasterId, _moderatorId);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var viewers = await GetChattersAsync(
                    stoppingToken);

                await _chattersAggregator.UpdatePlatformChattersAsync(
                    "twitch",
                    viewers,
                    stoppingToken);
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
                    "Ошибка TwitchViewerService");
            }

            try
            {
                await Task.Delay(
                    _chattersRefreshInterval,
                    stoppingToken);
            }
            catch (OperationCanceledException)
                when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    private async Task<string?> ResolveUserIdAsync(string login, CancellationToken ct)
    {
        var token = await _authService.GetClientCredentialsAsync(ct);

        if (token == null)
        {
            return null;
        }

        var http =
            _httpClientFactory.CreateClient();

        using var req = new HttpRequestMessage(
            HttpMethod.Get,
            $"https://api.twitch.tv/helix/users?login={login}");

        req.Headers.Add(
            "Client-Id",
            _options.ClientId);

        req.Headers.Authorization =
            new AuthenticationHeaderValue(
                "Bearer",
                token.AccessToken);

        using var resp =
            await http.SendAsync(req, ct);

        if (!resp.IsSuccessStatusCode)
        {
            return null;
        }

        using var doc =
            JsonDocument.Parse(
                await resp.Content.ReadAsStringAsync(ct));

        var data =
            doc.RootElement.GetProperty("data");

        if (data.GetArrayLength() == 0)
        {
            return null;
        }

        return data[0]
            .GetProperty("id")
            .GetString();
    }

    private async Task<string?> ResolveCurrentUserIdAsync(
        CancellationToken ct)
    {
        var token =
            await _authService.GetUserAccessTokenAsync(ct);

        if (token == null)
        {
            return null;
        }

        var http =
            _httpClientFactory.CreateClient();

        using var req = new HttpRequestMessage(
            HttpMethod.Get,
            "https://api.twitch.tv/helix/users");

        req.Headers.Add(
            "Client-Id",
            _options.ClientId);

        req.Headers.Authorization =
            new AuthenticationHeaderValue(
                "Bearer",
                token.AccessToken);

        using var resp =
            await http.SendAsync(req, ct);

        if (!resp.IsSuccessStatusCode)
        {
            return null;
        }

        using var doc =
            JsonDocument.Parse(
                await resp.Content.ReadAsStringAsync(ct));

        var data =
            doc.RootElement.GetProperty("data");

        if (data.GetArrayLength() == 0)
        {
            return null;
        }

        return data[0]
            .GetProperty("id")
            .GetString();
    }

    private async Task<List<ChattersInfoDto>> GetChattersAsync(
        CancellationToken ct)
    {
        var result = new List<ChattersInfoDto>();

        var token =
            await _authService.GetUserAccessTokenAsync(ct);

        if (token == null)
        {
            return result;
        }

        var http =
            _httpClientFactory.CreateClient();

        string? cursor = null;

        do
        {
            var url =
                "https://api.twitch.tv/helix/chat/chatters" +
                $"?broadcaster_id={_broadcasterId}" +
                $"&moderator_id={_moderatorId}" +
                "&first=100";

            if (!string.IsNullOrWhiteSpace(cursor))
            {
                url += $"&after={cursor}";
            }

            using var req = new HttpRequestMessage(
                HttpMethod.Get,
                url);

            req.Headers.Add(
                "Client-Id",
                _options.ClientId);

            req.Headers.Authorization =
                new AuthenticationHeaderValue(
                    "Bearer",
                    token.AccessToken);

            using var resp =
                await http.SendAsync(req, ct);

            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "GetChatters failed: {Status}",
                    resp.StatusCode);

                return result;
            }

            using var doc =
                JsonDocument.Parse(
                    await resp.Content.ReadAsStringAsync(ct));

            foreach (var chatter in
                     doc.RootElement
                        .GetProperty("data")
                        .EnumerateArray())
            {
                result.Add(
                    new ChattersInfoDto
                    {
                        UserId = chatter
                            .GetProperty("user_id")
                            .GetString() ?? "",

                        Login = chatter
                            .GetProperty("user_login")
                            .GetString() ?? "",

                        DisplayName = chatter
                            .GetProperty("user_name")
                            .GetString() ?? "",

                        Platform = "twitch"
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
                    cursor =
                        cursorElement.GetString();
                }
            }

        } while (!string.IsNullOrWhiteSpace(cursor));

        return result;
    }
}