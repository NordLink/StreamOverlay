using Microsoft.Extensions.Options;
using TwitchLib.Client;
using TwitchLib.Client.Models;
public class TwitchChatService : BackgroundService
{
    private readonly IOverlayBroadcastService _broadcast;
    private readonly TwitchOptions _options;
    private readonly ILogger<TwitchChatService> _logger;
    private TwitchClient? _client;
    public TwitchChatService(
        IOverlayBroadcastService broadcast,
        IOptions<TwitchOptions> options,
        ILogger<TwitchChatService> logger)
    {
        _broadcast = broadcast;
        _options = options.Value;
        _logger = logger;
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (string.IsNullOrWhiteSpace(_options.BotUsername) ||
            string.IsNullOrWhiteSpace(_options.BotOauth) ||
            string.IsNullOrWhiteSpace(_options.WatchChannel))
        {
            _logger.LogWarning("Twitch chat не запущен: отсутствуют TWITCH_BOT_USERNAME / TWITCH_BOT_OAUTH / WATCH_CHANNEL.");
            return;
        }
        var credentials = new ConnectionCredentials(_options.BotUsername, _options.BotOauth);
        _client = new TwitchClient();
        _client.Initialize(credentials, _options.WatchChannel);

        // Логирование ошибок 
        _client.OnConnectionError += async  (_, e) =>
        {
            _logger.LogError("Ошибка подключения к Twitch: {Error}", e.Error.Message);
        };

        _client.OnIncorrectLogin += async (_, e) =>
        {
            _logger.LogError("Ошибка авторизации Twitch: Неверный логин или OAuth токен. Проверьте учетные данные: {Exception}", e.Exception?.Message);
        };
        
        _client.OnJoinedChannel += async  (_, e) =>
        {
            _logger.LogInformation("Успешно зашли на канал: {Channel}", e.Channel);
        };
       
        _client.OnFailureToReceiveJoinConfirmation += async (_, e) =>
        {
            _logger.LogWarning("Не удалось зайти на канал: {Exception}", e.Exception);
        };
    
        _client.OnDisconnected += async (_, e) =>
        {
            _logger.LogWarning("Twitch chat отключен.");
        };

        _client.OnMessageReceived += async (_, e) =>
        {

            var emoteList = new List<OverlayEmoteDto>();
            if (e.ChatMessage.EmoteSet != null && e.ChatMessage.EmoteSet.Emotes.Count > 0)
            {
                foreach (var emote in e.ChatMessage.EmoteSet.Emotes)
                {
                    var url = $"https://static-cdn.jtvnw.net/emoticons/v2/{emote.Id}/default/dark/3.0";
                    emoteList.Add(new OverlayEmoteDto(emote.Id, emote.Name, url));
                }
            }

            try
            {
                var userName = string.IsNullOrWhiteSpace(e.ChatMessage.DisplayName)
                    ? e.ChatMessage.Username
                    : e.ChatMessage.DisplayName;
                var userColor = ResolveUserColor(e.ChatMessage.Username, e.ChatMessage.HexColor);

                // преобразования времени из UTC в московское (UTC+3) и форматирования в строку «часы:минуты»
                var moscowTime = e.ChatMessage.TmiSent.ToOffset(TimeSpan.FromHours(3));
                var formattedDate = moscowTime.ToString("HH:mm");

                await _broadcast.SendChatMessageAsync(new OverlayChatMessageDto(
                    Platform: "twitch", 
                    User: userName, 
                    Message: e.ChatMessage.Message, 
                    Color: e.ChatMessage.HexColor, 
                    SendTime: formattedDate,
                    Emotes: emoteList,
                    IsHighlighted: e.ChatMessage.IsHighlighted
                    ), 
                  stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Ошибка при обработке сообщения Twitch.");
            }
        };
        _client.OnConnected += (_, _) =>
        {
            _logger.LogInformation("Twitch chat подключен.");
            return Task.CompletedTask;
        };
        await _client.ConnectAsync();
        try
        {
            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        catch (OperationCanceledException)
        {
        }
        if (_client.IsConnected)
            await _client.DisconnectAsync();
    }
    private static readonly string[] TwitchDefaultColors =
      {
        "#FF0000", "#0000FF", "#008000", "#B22222", "#FF7F50",
        "#9ACD32", "#FF4500", "#2E8B57", "#DAA520", "#D2691E",
        "#5F9EA0", "#1E90FF", "#FF69B4", "#8A2BE2", "#00FF7F"
    };

    private static string ResolveUserColor(string? userName, string? colorFromTwitch)
    {
        if (!string.IsNullOrWhiteSpace(colorFromTwitch))
            return colorFromTwitch;
        var seed = string.IsNullOrWhiteSpace(userName)
            ? "anonymous"
            : userName.Trim().ToLowerInvariant();
        unchecked
        {
            int hash = 5381;
            foreach (char c in seed)
            {
                hash = ((hash << 5) + hash) ^ c;
            }
            int index = Math.Abs(hash) % TwitchDefaultColors.Length;
            return TwitchDefaultColors[index];
        }
    }


}