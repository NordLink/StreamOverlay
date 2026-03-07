using Microsoft.AspNetCore.SignalR;
using TwitchLib.Client;
using TwitchLib.Client.Models;
public class TwitchChatService : BackgroundService
{ 
    private readonly IHubContext<ChatHub> _hub;
    private readonly TwitchTokenProvider _settings;
    private TwitchClient? _client;
    public TwitchChatService(IHubContext<ChatHub> hub, TwitchTokenProvider settings)
    {
        _hub = hub;
        _settings = settings;
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var botUsername = Environment.GetEnvironmentVariable("TWITCH_BOT_USERNAME");
        var botOauth = Environment.GetEnvironmentVariable("TWITCH_BOT_OAUTH");

        if (string.IsNullOrEmpty(botUsername) || string.IsNullOrEmpty(botOauth) || string.IsNullOrEmpty(_settings.WatchChannel))
            return;
        var credentials = new ConnectionCredentials(botUsername, botOauth);
        _client = new TwitchClient();
        _client.Initialize(credentials, _settings.WatchChannel);
        _client.OnMessageReceived += async (s, e) =>
        {
            string userName = e.ChatMessage.DisplayName;
            string userColor = e.ChatMessage.HexColor;
           
            if (string.IsNullOrEmpty(userColor))
            {
                // Список стандартных ярких цветов Twitch
                string[] defaultColors = {
                    "#FF0000", "#0000FF", "#008000", "#B22222", "#FF7F50",
                    "#9ACD32", "#FF4500", "#2E8B57", "#DAA520", "#D2691E",
                    "#5F9EA0", "#1E90FF", "#FF69B4", "#8A2BE2", "#00FF7F"
                };
                // Используем GetHashCode(), чтобы привязать число к имени пользователя
                // Math.Abs нужен, чтобы индекс не был отрицательным
                int index = Math.Abs(userName.ToLower().GetHashCode()) % defaultColors.Length;
                userColor = defaultColors[index];
               
            }
 
            // Отправляем в SignalR
            await _hub.Clients.All.SendAsync("chatMessage", new
            {
                user = userName,
                message = e.ChatMessage.Message,
                color = userColor 
            }, stoppingToken);
        };
        _client.OnConnected += (s, e) => { Console.WriteLine("[TwitchChatService] Чат успешно подключен!"); return Task.CompletedTask; };
        await _client.ConnectAsync();
        
        await Task.Delay(Timeout.Infinite, stoppingToken);
        if (_client.IsConnected) await _client.DisconnectAsync();
    }
}
