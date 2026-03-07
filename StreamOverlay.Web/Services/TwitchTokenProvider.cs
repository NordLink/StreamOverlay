using System.Text.Json;
public class TwitchTokenProvider
{
    private readonly IHttpClientFactory _httpClientFactory;
    private string? _accessToken;
    private DateTimeOffset _expiresAt = DateTimeOffset.MinValue;

    public string ClientId { get; private set; } = "";
    public string ClientSecret { get; private set; } = "";
    public string WatchChannel { get; private set; } = "";
    public TwitchTokenProvider(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;

        ClientId = Environment.GetEnvironmentVariable("TWITCH_CLIENT_ID") ?? "";
        ClientSecret = Environment.GetEnvironmentVariable("TWITCH_CLIENT_SECRET") ?? "";
        WatchChannel = (Environment.GetEnvironmentVariable("WATCH_CHANNEL") ?? "").Trim().ToLowerInvariant();
        Console.WriteLine($"[AUTH] Инициализация провайдера. Канал: {WatchChannel}");
        if (string.IsNullOrEmpty(ClientId) || string.IsNullOrEmpty(ClientSecret))
        {
            Console.WriteLine("[ERROR] Ключи ClientId или ClientSecret не найдены в Environment!");
        }
    }
    public async Task<string?> GetTokenAsync(CancellationToken ct)
    {
        if (string.IsNullOrEmpty(ClientId) || string.IsNullOrEmpty(ClientSecret))
        {
            Console.WriteLine("[AUTH] Ошибка: Отсутствуют ClientId или ClientSecret. Запрос токена невозможен.");
            return null;
        }
        
        if (!string.IsNullOrEmpty(_accessToken) && DateTimeOffset.UtcNow < _expiresAt.AddMinutes(-2))
        {
            // Этот лог можно оставить как Debug, чтобы не спамить в консоль каждые 5 секунд
            // Console.WriteLine($"[AUTH] Используем токен из кэша. Истекает через: {(_expiresAt - DateTimeOffset.UtcNow).TotalMinutes:F1} мин.");
            return _accessToken;
        }
        Console.WriteLine("[AUTH] Токен отсутствует или истек. Запрашиваю новый токен в Twitch API...");
       
        try
        {
            var http = _httpClientFactory.CreateClient();
            var url = $"https://id.twitch.tv/oauth2/token?client_id={ClientId}&client_secret={ClientSecret}&grant_type=client_credentials";

            var resp = await http.PostAsync(url, null, ct);
            if (!resp.IsSuccessStatusCode)
            {
                var errorContent = await resp.Content.ReadAsStringAsync(ct);
                Console.WriteLine($"[ERROR] Ошибка запроса токена: {resp.StatusCode}. Детали: {errorContent}");
                return null;
            }
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));

            _accessToken = doc.RootElement.GetProperty("access_token").GetString();
            int expiresIn = doc.RootElement.GetProperty("expires_in").GetInt32();
            _expiresAt = DateTimeOffset.UtcNow.AddSeconds(expiresIn);
            Console.WriteLine($"[AUTH] Новый токен успешно получен! Валиден в течение: {expiresIn / 60} мин.");
            return _accessToken;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[CRITICAL] Исключение при получении токена: {ex.Message}");
            return null;
        }
    }
}