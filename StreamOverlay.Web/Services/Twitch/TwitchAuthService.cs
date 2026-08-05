using System.Text.Json;
using System.Net;
using Microsoft.Extensions.Options;

public record TwitchAuthResult(
    string AccessToken,
    string? RefreshToken,
    int ExpiresIn
);

public class TwitchAuthService : IDisposable
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly TwitchOptions _options;
    private readonly ILogger<TwitchAuthService> _logger;

    private readonly SemaphoreSlim _appLock = new(1, 1);
    private string? _appAccessToken;
    private DateTimeOffset _appExpires = DateTimeOffset.MinValue;

    private readonly SemaphoreSlim _userLock = new(1, 1);
    private string? _userAccessToken;
    private DateTimeOffset _userExpires = DateTimeOffset.MinValue;
    private string? _refreshToken;

    public event Func<string?, Task>? UserTokenRefreshed;

    public TwitchAuthService(
        IHttpClientFactory httpClientFactory,
        IOptions<TwitchOptions> options,
        ILogger<TwitchAuthService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _logger = logger;

        try
        {
            _refreshToken = LoadRefreshToken();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Не удалось загрузить начальный refresh token");
            _refreshToken = null;
        }
    }

    // Возвращает app token, кэшируя его
    public async Task<TwitchAuthResult?> GetClientCredentialsAsync(CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        if (!string.IsNullOrWhiteSpace(_appAccessToken) && now < _appExpires.AddMinutes(-2))
            return new TwitchAuthResult(_appAccessToken!, null, (int)(_appExpires - now).TotalSeconds);

        await _appLock.WaitAsync(ct);
        try
        {
            now = DateTimeOffset.UtcNow;
            if (!string.IsNullOrWhiteSpace(_appAccessToken) && now < _appExpires.AddMinutes(-2))
                return new TwitchAuthResult(_appAccessToken!, null, (int)(_appExpires - now).TotalSeconds);

            var http = _httpClientFactory.CreateClient();
            using var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = _options.ClientId,
                ["client_secret"] = _options.ClientSecret,
                ["grant_type"] = "client_credentials"
            });

            using var resp = await http.PostAsync("https://id.twitch.tv/oauth2/token", content, ct);
            if (!resp.IsSuccessStatusCode)
            {
                var body = await resp.Content.ReadAsStringAsync(ct);
                _logger.LogError("GetClientCredentialsAsync failed: {Status} {Body}", resp.StatusCode, body);
                return null;
            }

            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
            var access = doc.RootElement.GetProperty("access_token").GetString();
            if (string.IsNullOrWhiteSpace(access))
            {
                _logger.LogError("Twitch вернул пустой app access token");
                return null;
            }
            var expiresIn = doc.RootElement.GetProperty("expires_in").GetInt32();

            _appAccessToken = access;
            _appExpires = DateTimeOffset.UtcNow.AddSeconds(expiresIn);
            return new TwitchAuthResult(_appAccessToken!, null, expiresIn);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Исключение в GetClientCredentialsAsync");
            return null;
        }
        finally
        {
            _appLock.Release();
        }
    }

    // Возвращает пользовательский access token, кэшируя и обновляя по refresh token при необходимости
    public async Task<TwitchAuthResult?> GetUserAccessTokenAsync(CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        if (!string.IsNullOrWhiteSpace(_userAccessToken) && now < _userExpires.AddMinutes(-2))
            return new TwitchAuthResult(_userAccessToken!, null, (int)(_userExpires - now).TotalSeconds);

        await _userLock.WaitAsync(ct);
        TwitchAuthResult? res = null;
        string? oldToken = _userAccessToken;
        try
        {
            now = DateTimeOffset.UtcNow;
            if (!string.IsNullOrWhiteSpace(_userAccessToken) && now < _userExpires.AddMinutes(-2))
                return new TwitchAuthResult(_userAccessToken!, null, (int)(_userExpires - now).TotalSeconds);

            var refreshToken = _refreshToken ?? LoadRefreshToken();
            if (string.IsNullOrWhiteSpace(refreshToken))
                return null;

            res = await RefreshTokenInternalAsync(refreshToken, ct);
            return res;
        }
        finally
        {
            _userLock.Release();
            if (res != null && !string.IsNullOrWhiteSpace(res.AccessToken) && res.AccessToken != oldToken)
            {
                try
                {
                    await NotifyUserTokenRefreshedAsync(res.AccessToken);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "NotifyUserTokenRefreshedAsync failed in GetUserAccessTokenAsync");
                }
            }
        }
    }

    // Явное обновление по refresh_token. Сохраняет новый refresh token при ротации и кэширует user token.
    public async Task<TwitchAuthResult?> RefreshTokenAsync(string refreshToken, CancellationToken ct)
    {
        await _userLock.WaitAsync(ct);
        TwitchAuthResult? res = null;
        string? oldToken = _userAccessToken;
        try
        {
            res = await RefreshTokenInternalAsync(refreshToken, ct);
            return res;
        }
        finally
        {
            _userLock.Release();
            if (res != null && !string.IsNullOrWhiteSpace(res.AccessToken) && res.AccessToken != oldToken)
            {
                try
                {
                    await NotifyUserTokenRefreshedAsync(res.AccessToken);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "NotifyUserTokenRefreshedAsync failed in RefreshTokenAsync");
                }
            }
        }
    }

    private async Task<TwitchAuthResult?> RefreshTokenInternalAsync(string refreshToken, CancellationToken ct)
    {
        try
        {
            var http = _httpClientFactory.CreateClient();
            using var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = _options.ClientId,
                ["client_secret"] = _options.ClientSecret,
                ["grant_type"] = "refresh_token",
                ["refresh_token"] = refreshToken
            });

            using var resp = await http.PostAsync("https://id.twitch.tv/oauth2/token", content, ct);
            if (!resp.IsSuccessStatusCode)
            {
                var body = await resp.Content.ReadAsStringAsync(ct);
                _logger.LogWarning("RefreshTokenAsync failed: {Status} {Body}", resp.StatusCode, body);

                // При явно неверном refresh token очищаем кэш
                if (resp.StatusCode == HttpStatusCode.BadRequest || resp.StatusCode == HttpStatusCode.Unauthorized)
                {
                    _userAccessToken = null;
                    _userExpires = DateTimeOffset.MinValue;
                }
                return null;
            }

            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
            var access = doc.RootElement.GetProperty("access_token").GetString();
            if (string.IsNullOrWhiteSpace(access))
            {
                _logger.LogWarning("Twitch вернул пустой user access token при обновлении");
                return null;
            }
            var expiresIn = doc.RootElement.GetProperty("expires_in").GetInt32();
            string? newRefresh = null;

            if (doc.RootElement.TryGetProperty("refresh_token", out var rtEl))
                newRefresh = rtEl.GetString();

            if (!string.IsNullOrWhiteSpace(newRefresh) && newRefresh != refreshToken)
            {
                var ok = SaveRefreshToken(newRefresh);

                if (!ok)
                {
                    _logger.LogCritical(
                        "Не удалось сохранить refresh token. Процесс обновления прерван.");

                    return null;
                }

                _refreshToken = newRefresh;
            }
            else
            {
                _refreshToken = refreshToken;
            }

            _userAccessToken = access;
            _userExpires = DateTimeOffset.UtcNow.AddSeconds(expiresIn);

            try
            {
                _refreshToken = newRefresh ?? refreshToken;
            }
            catch { }

            return new TwitchAuthResult(access, newRefresh, expiresIn);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Исключение в RefreshTokenInternalAsync");
            return null;
        }
    }

    private async Task NotifyUserTokenRefreshedAsync(string? token)
    {
        var handlers = UserTokenRefreshed;
        if (handlers == null)
            return;

        var invocationList = handlers.GetInvocationList();
        foreach (var del in invocationList)
        {
            try
            {
                var fn = (Func<string?, Task>)del;
                await fn(token);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Обработчик UserTokenRefreshed вызвал исключение");
            }
        }
    }

    private string? LoadRefreshToken()
    {
        try
        {
            var path = Path.Combine(AppContext.BaseDirectory, "bot_refresh_token.txt");
            _logger.LogInformation("Поиск refresh token: {Path}", path);

            if (File.Exists(path))
            {
                var value = File.ReadAllText(path).Trim();

                if (!string.IsNullOrWhiteSpace(value))
                {
                    _logger.LogInformation("Загружен refresh token из файла.");
                    return value;
                }

                _logger.LogWarning("Файл для хранения refresh token существует, но пуст.");
            }

            var env = Environment.GetEnvironmentVariable("TWITCH_REFRESH_TOKEN");

            if (!string.IsNullOrWhiteSpace(env))
            {
                _logger.LogInformation("Refresh token загружен из переменной окружения");
                return env.Trim();
            }

            _logger.LogWarning("Refresh token не найден в переменной окружения.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Не удалось загрузить refresh token.");
        }

        return null;
    }

    private bool SaveRefreshToken(string token)
    {
        try
        {
            var path = Path.Combine(AppContext.BaseDirectory, "bot_refresh_token.txt");
            var temp = path + ".tmp";
            File.WriteAllText(temp, token);
            File.Move(temp, path, true);
            _logger.LogInformation("Refresh token сохранент в файл: {Path}", path);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Не удалось сохранить refresh token");
            return false;
        }
    }

    public void Dispose()
    {
        try
        {
            _appLock.Dispose();
        }
        catch { }
        try
        {
            _userLock.Dispose();
        }
        catch { }
    }
}