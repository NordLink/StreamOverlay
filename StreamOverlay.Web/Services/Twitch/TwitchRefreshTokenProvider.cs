using System.Text.Json;
using Microsoft.Extensions.Options;

public class TwitchRefreshTokenProvider
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly TwitchOptions _options;
    private readonly ILogger<TwitchRefreshTokenProvider> _logger;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private string? _cachedAccessToken;
    private DateTimeOffset _expiresAt = DateTimeOffset.MinValue;
    // Токен теперь хранится в надежном месте, например, в базе данных
    private string _currentRefreshToken;

    public TwitchRefreshTokenProvider(
        IHttpClientFactory httpClientFactory,
        IOptions<TwitchOptions> options,
        ILogger<TwitchRefreshTokenProvider> logger)
    {
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _logger = logger;
        // Загружаем refresh token из защищенного хранилища
        _currentRefreshToken = LoadRefreshTokenFromSecureStorage();
    }

    public async Task<string?> GetValidAccessTokenAsync(CancellationToken ct)
    {
        // Если токен еще жив (с запасом в 5 минут), возвращаем его
        if (!string.IsNullOrWhiteSpace(_cachedAccessToken) &&
            DateTimeOffset.UtcNow < _expiresAt.AddMinutes(-5))
        {
            return _cachedAccessToken;
        }

        await _lock.WaitAsync(ct);
        try
        {
            // Double-check после получения блокировки
            if (!string.IsNullOrWhiteSpace(_cachedAccessToken) &&
                DateTimeOffset.UtcNow < _expiresAt.AddMinutes(-5))
            {
                return _cachedAccessToken;
            }

            _logger.LogInformation("Refreshing Twitch user access token...");
            var http = _httpClientFactory.CreateClient();

            var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = _options.ClientId,
                ["client_secret"] = _options.ClientSecret,
                ["grant_type"] = "refresh_token",
                ["refresh_token"] = _currentRefreshToken
            });

            using var response = await http.PostAsync(
                "https://id.twitch.tv/oauth2/token", content, ct);

            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync(ct);
                _logger.LogError("Token refresh failed: {StatusCode} - {Error}",
                    response.StatusCode, error);
                return null;
            }

            using var doc = await JsonDocument.ParseAsync(
                await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);

            _cachedAccessToken = doc.RootElement.GetProperty("access_token").GetString();
            var expiresIn = doc.RootElement.GetProperty("expires_in").GetInt32();
            _expiresAt = DateTimeOffset.UtcNow.AddSeconds(expiresIn);

            // TWITCH МОЖЕТ ВЕРНУТЬ НОВЫЙ REFRESH TOKEN — его нужно сохранить!
            if (doc.RootElement.TryGetProperty("refresh_token", out var newRefreshToken))
            {
                _currentRefreshToken = newRefreshToken.GetString()!;
                SaveRefreshTokenToSecureStorage(_currentRefreshToken);
                _logger.LogInformation("Refresh token has been rotated and saved.");
            }

            _logger.LogInformation($"Token refreshed successfully. Expires in {expiresIn / 60} min.");
            return _cachedAccessToken;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error during token refresh.");
            return null;
        }
        finally
        {
            _lock.Release();
        }
    }

    private string LoadRefreshTokenFromSecureStorage()
    {
        // Реализуйте загрузку из базы данных или другого безопасного хранилища
        return File.ReadAllText("bot_refresh_token.txt");
    }

    private void SaveRefreshTokenToSecureStorage(string token)
    {
        // Реализуйте сохранение в базу данных или другое безопасное хранилище
        File.WriteAllText("bot_refresh_token.txt", token);
    }
}