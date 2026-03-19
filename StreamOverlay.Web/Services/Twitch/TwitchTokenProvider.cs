using System.Text.Json;
using Microsoft.Extensions.Options;

public class TwitchTokenProvider
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly TwitchOptions _options;
    private readonly ILogger<TwitchTokenProvider> _logger;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);
    private string? _accessToken;
    private DateTimeOffset _expiresAt = DateTimeOffset.MinValue;
    public string ClientId => _options.ClientId;
    public string WatchChannel => _options.WatchChannel;
    public TwitchTokenProvider(
        IHttpClientFactory httpClientFactory,
        IOptions<TwitchOptions> options,
        ILogger<TwitchTokenProvider> logger)
    {
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _logger = logger;
    }
    public async Task<string?> GetTokenAsync(CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_options.ClientId) || string.IsNullOrWhiteSpace(_options.ClientSecret))
        {
            _logger.LogWarning("Twitch ClientId/ClientSecret не заданы.");
            return null;
        }
        if (!string.IsNullOrWhiteSpace(_accessToken) && DateTimeOffset.UtcNow < _expiresAt.AddMinutes(-2))
            return _accessToken;
        await _refreshLock.WaitAsync(ct);
        try
        {
            if (!string.IsNullOrWhiteSpace(_accessToken) && DateTimeOffset.UtcNow < _expiresAt.AddMinutes(-2))
                return _accessToken;
            _logger.LogInformation("Twitch token отсутствует или истек. Запрашиваю новый token...");
            var http = _httpClientFactory.CreateClient();
            using var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = _options.ClientId,
                ["client_secret"] = _options.ClientSecret,
                ["grant_type"] = "client_credentials"
            });
            using var response = await http.PostAsync("https://id.twitch.tv/oauth2/token", content, ct);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync(ct);
                _logger.LogError("Ошибка получения Twitch token: {StatusCode}. {Body}", response.StatusCode, error);
                return null;
            }
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            _accessToken = doc.RootElement.GetProperty("access_token").GetString();
            var expiresIn = doc.RootElement.GetProperty("expires_in").GetInt32();
            _expiresAt = DateTimeOffset.UtcNow.AddSeconds(expiresIn);
            _logger.LogInformation("Twitch token обновлен. Валиден еще {Minutes} минут.", expiresIn / 60);
            return _accessToken;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Исключение при получении Twitch token.");
            return null;
        }
        finally
        {
            _refreshLock.Release();
        }
    }
}