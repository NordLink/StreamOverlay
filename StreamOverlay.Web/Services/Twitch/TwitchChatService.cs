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
        _client.OnMessageReceived += async (_, e) =>
        {
            try
            {
                var userName = string.IsNullOrWhiteSpace(e.ChatMessage.DisplayName)
                    ? e.ChatMessage.Username
                    : e.ChatMessage.DisplayName;
                var userColor = ResolveUserColor(e.ChatMessage.Id, userName, e.ChatMessage.HexColor);
                await _broadcast.SendChatMessageAsync(
                    new OverlayChatMessageDto(
                        "twitch",
                        userName,
                        e.ChatMessage.Message,
                        userColor),
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

    private static string ResolveUserColor(string userId, string userName, string? colorFromTwitch)
    {


        if (!string.IsNullOrWhiteSpace(colorFromTwitch))
            return colorFromTwitch;
        // Используем ID пользователя (e.ChatMessage.UserId), если он доступен, 
        // так как никнейм можно сменить, а ID — нет.
        string seed = string.IsNullOrWhiteSpace(userId) ? userName.ToLowerInvariant() : userId;

        // Ручное вычисление стабильного индекса
        int hash = 0;
        foreach (char c in seed)
        {
            hash = (hash << 5) - hash + c;
        }

        int index = Math.Abs(hash) % TwitchDefaultColors.Length;
        return TwitchDefaultColors[index];
    }
}