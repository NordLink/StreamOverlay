using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Options;
public class TwitchChannelInfoService : BackgroundService
{
    private readonly IOverlayBroadcastService _broadcast;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly TwitchAuthService _authService;
    private readonly TwitchOptions _options;
    private readonly ILogger<TwitchChannelInfoService> _logger;
    public TwitchChannelInfoService(
        IOverlayBroadcastService broadcast,
        IHttpClientFactory httpClientFactory,
        TwitchAuthService tokenProvider,
        IOptions<TwitchOptions> options,
        ILogger<TwitchChannelInfoService> logger)
    {
        _broadcast = broadcast;
        _httpClientFactory = httpClientFactory;
        _authService = tokenProvider;
        _options = options.Value;
        _logger = logger;
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (string.IsNullOrWhiteSpace(_options.WatchChannel))
        {
            _logger.LogWarning("WATCH_CHANNEL не задан. TwitchChannelInfoService остановлен.");
            return;
        }
        _logger.LogInformation("Запуск TwitchChannelInfoService для канала {Channel}", _options.WatchChannel);
        await PushChannelInfoAsync(stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PushViewerCountAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Ошибка в TwitchChannelInfoService.");
            }
            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
    }
    private async Task PushChannelInfoAsync(CancellationToken ct)
    {
        var tokenRes = await _authService.GetClientCredentialsAsync(ct);
        var token = tokenRes?.AccessToken;

        if (string.IsNullOrWhiteSpace(token))
            return;
        try
        {
            var http = _httpClientFactory.CreateClient();
            using var req = new HttpRequestMessage(
                HttpMethod.Get,
                $"https://api.twitch.tv/helix/users?login={_options.WatchChannel}");
            req.Headers.Add("Client-Id", _options.ClientId);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var resp = await http.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("Ошибка Twitch users API: {StatusCode}", resp.StatusCode);
                return;
            }
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
            var data = doc.RootElement.GetProperty("data");
            if (data.GetArrayLength() == 0)
            {
                _logger.LogWarning("Пользователь Twitch {Channel} не найден.", _options.WatchChannel);
                return;
            }
            var displayName = data[0].GetProperty("display_name").GetString() ?? _options.WatchChannel;

            await _broadcast.SendChannelInfoAsync(
                new OverlayChannelInfoDto("twitch", _options.WatchChannel, displayName),
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка при запросе channel info Twitch.");
        }
    }
    private async Task PushViewerCountAsync(CancellationToken ct)
    {
        var tokenRes = await _authService.GetClientCredentialsAsync(ct);
        var token = tokenRes?.AccessToken;
        if (string.IsNullOrWhiteSpace(token))
            return;
        try
        {
            var http = _httpClientFactory.CreateClient();
            using var req = new HttpRequestMessage(
                HttpMethod.Get,
                $"https://api.twitch.tv/helix/streams?user_login={_options.WatchChannel}");
            req.Headers.Add("Client-Id", _options.ClientId);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var resp = await http.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("Ошибка Twitch streams API: {StatusCode}", resp.StatusCode);
                return;
            }
            int count = 0;
            bool isLive = false;
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
            var data = doc.RootElement.GetProperty("data");
            if (data.GetArrayLength() > 0)
            {
                count = data[0].GetProperty("viewer_count").GetInt32();
                isLive = true;
            }
            await _broadcast.SendViewerCountAsync(
                new OverlayViewerCountDto("twitch", count, isLive),
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка при запросе viewer count Twitch.");
        }
    }
}