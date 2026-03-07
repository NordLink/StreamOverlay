using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
public class TwitchChannelInfoService : BackgroundService
{
    private readonly IHubContext<ChatHub> _hub;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly TwitchTokenProvider _tokenProvider;
    public TwitchChannelInfoService(IHubContext<ChatHub> hub, IHttpClientFactory httpClientFactory, TwitchTokenProvider tokenProvider)
    {
        _hub = hub;
        _httpClientFactory = httpClientFactory;
        _tokenProvider = tokenProvider;
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        Console.WriteLine($"[TwitchChannnelInfoService] Запуск фоновой службы для канала: {_tokenProvider.WatchChannel}");
        await PushChannelInfo(stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PushViewerCount(stoppingToken);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TwitchChannnelInfoService] Критическая ошибка в цикле: {ex.Message}");
            }
            // Интервал обновления (30 секунд)
            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
    }
    private async Task PushChannelInfo(CancellationToken ct)
    {
        Console.WriteLine($"[TwitchChannnelInfoService] Запрос информации о канале: {_tokenProvider.WatchChannel}");

        var token = await _tokenProvider.GetTokenAsync(ct);
        if (token == null)
        {
            Console.WriteLine("[TwitchChannnelInfoService] ОШИБКА: Не удалось получить токен для PushChannelInfo.");
            return;
        }
        try
        {
            var http = _httpClientFactory.CreateClient();
            using var req = new HttpRequestMessage(HttpMethod.Get, $"https://api.twitch.tv/helix/users?login={_tokenProvider.WatchChannel}");

            req.Headers.Add("Client-Id", _tokenProvider.ClientId);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var resp = await http.SendAsync(req, ct);

            if (resp.IsSuccessStatusCode)
            {
                using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
                var data = doc.RootElement.GetProperty("data");
                if (data.GetArrayLength() > 0)
                {
                    var displayName = data[0].GetProperty("display_name").GetString();
                    Console.WriteLine($"[TwitchChannnelInfoService] Данные канала получены: {displayName}");

                    await _hub.Clients.All.SendAsync("channelInfo", new { login = _tokenProvider.WatchChannel, displayName }, ct);
                }
                else
                {
                    Console.WriteLine($"[TwitchChannnelInfoService] ПРЕДУПРЕЖДЕНИЕ: Пользователь {_tokenProvider.WatchChannel} не найден.");
                }
            }
            else
            {
                Console.WriteLine($"[TwitchChannnelInfoService] ОШИБКА API (Users): {resp.StatusCode} {resp.ReasonPhrase}");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[TwitchChannnelInfoService] Исключение в PushChannelInfo: {ex.Message}");
        }
    }
    private async Task PushViewerCount(CancellationToken ct)
    {
        var token = await _tokenProvider.GetTokenAsync(ct);
        if (token == null)
        {
            Console.WriteLine("[TwitchChannnelInfoService] ОШИБКА: Токен отсутствует, пропуск обновления зрителей.");
            return;
        }
        try
        {
            var http = _httpClientFactory.CreateClient();
            using var req = new HttpRequestMessage(HttpMethod.Get, $"https://api.twitch.tv/helix/streams?user_login={_tokenProvider.WatchChannel}");

            req.Headers.Add("Client-Id", _tokenProvider.ClientId);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var resp = await http.SendAsync(req, ct);

            int count = 0;
            bool isLive = false;
            if (resp.IsSuccessStatusCode)
            {
                using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
                var data = doc.RootElement.GetProperty("data");
                if (data.GetArrayLength() > 0)
                {
                    count = data[0].GetProperty("viewer_count").GetInt32();
                    isLive = true;
                    Console.WriteLine($"[TwitchChannnelInfoService] Стрим ОНЛАЙН. Зрителей: {count}");
                }
                else
                {
                    Console.WriteLine("[TwitchChannnelInfoService] Стрим оффлайн.");
                }
                // Отправляем данные на фронтенд через SignalR
                await _hub.Clients.All.SendAsync("viewerCount", new { count, isLive }, ct);
            }
            else
            {
                Console.WriteLine($"[TwitchChannnelInfoService] ОШИБКА API (Streams): {resp.StatusCode}");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[TwitchChannnelInfoService] Исключение в PushViewerCount: {ex.Message}");
        }
    }
}