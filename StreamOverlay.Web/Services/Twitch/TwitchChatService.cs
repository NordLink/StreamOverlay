using Microsoft.Extensions.Options;
using TwitchLib.Client;
using TwitchLib.Client.Events;
using TwitchLib.Client.Models;
using System.Threading;

public class TwitchChatService : BackgroundService
{
    private readonly IOverlayBroadcastService _broadcast;
    private readonly TwitchOptions _options;
    private readonly ILogger<TwitchChatService> _logger;
    private readonly TwitchBadgeService _badgeService;
    private readonly TwitchAuthService _authService;
    private TwitchClient? _client;
    private readonly SemaphoreSlim _clientLock = new(1,1);
    private int _reconnecting = 0;
    private volatile bool _connected = false;
    private CancellationToken _serviceToken;

    public TwitchChatService(
        IOverlayBroadcastService broadcast,
        IOptions<TwitchOptions> options,
        ILogger<TwitchChatService> logger,
        TwitchBadgeService badgeService,
        TwitchAuthService authService)
    {
        _broadcast = broadcast;
        _options = options.Value;
        _logger = logger;
        _badgeService = badgeService;
        _authService = authService;
    }

    private async Task HandleMessageAsync(OnMessageReceivedArgs e, CancellationToken ct)
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
            var userName = string.IsNullOrWhiteSpace(e.ChatMessage.DisplayName) ? e.ChatMessage.Username : e.ChatMessage.DisplayName;
            var userColor = ResolveUserColor(e.ChatMessage.Username, e.ChatMessage.HexColor);
            var moscowTime = e.ChatMessage.TmiSent.ToOffset(TimeSpan.FromHours(3));
            var formattedDate = moscowTime.ToString("HH:mm");

            var badgeUrls = new List<string>();
            if (e.ChatMessage.Badges != null)
            {
                foreach (var b in e.ChatMessage.Badges)
                {
                    try
                    {
                        var url = await _badgeService.GetBadgeUrlAsync(b.Key, b.Value, _options.WatchChannel, ct);
                        if (!string.IsNullOrWhiteSpace(url)) badgeUrls.Add(url);
                    }
                    catch { }
                }
            }

            await _broadcast.SendChatMessageAsync(new OverlayChatMessageDto(
                Platform: "twitch",
                User: userName,
                Message: e.ChatMessage.Message,
                Color: userColor,
                UserId: e.ChatMessage.UserId,
                SendTime: formattedDate,
                Emotes: emoteList,
                Badges: badgeUrls,
                IsHighlighted: e.ChatMessage.IsHighlighted
            ), ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка при обработке сообщения Twitch.");
        }
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _serviceToken = stoppingToken;

        if (string.IsNullOrWhiteSpace(_options.BotUsername) || string.IsNullOrWhiteSpace(_options.WatchChannel))
        {
            _logger.LogWarning("Twitch chat не запущен: отсутствуют TWITCH_BOT_USERNAME или WATCH_CHANNEL.");
            return;
        }

        await InitializeAndConnectClientAsync(stoppingToken);

        try
        {
            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        catch (OperationCanceledException)
        {
        }
        finally
        {
            try
            {
                if (_client != null && _client.IsConnected)
                    await _client.DisconnectAsync();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Ошибка при отключении клиента Twitch в блоке ExecuteAsync finally");
            }
        }
    }

    private async Task InitializeAndConnectClientAsync(CancellationToken ct)
    {
        _logger.LogInformation("Начало инициализации");
        await _clientLock.WaitAsync(ct);
        try
        {
            // Получаем токен: предпочитаем user token, если доступен, иначе fallback на BotOauth из конфигурации
            string? oauth = null;
            var user = await _authService.GetUserAccessTokenAsync(ct);
            if (user != null && !string.IsNullOrWhiteSpace(user.AccessToken))
            {
                oauth = user.AccessToken;
            }
            else if (!string.IsNullOrWhiteSpace(_options.BotOauth))
            {
                _logger.LogWarning("Токен пользователя недоступен. Возврат к статическому BotOauth.");
                oauth = _options.BotOauth;
            }

            if (string.IsNullOrWhiteSpace(oauth))
            {
                _logger.LogWarning("Нет доступного OAuth-токена для чата Twitch. Убедитесь, что файл bot_refresh_token.txt содержит действующий refresh-токен, или задайте переменную TWITCH_BOT_OAUTH");
                return;
            }

            if (!oauth.StartsWith("oauth:", StringComparison.OrdinalIgnoreCase))
                oauth = "oauth:" + oauth;

            var credentials = new ConnectionCredentials(_options.BotUsername, oauth);

            if (_client != null)
            {
                var oldClient = _client;
                _client = null;
                try
                {
                    if (oldClient.IsConnected)
                        await oldClient.DisconnectAsync();
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Ошибка при отключении старого клиента Twitch");
                }
            }

            _client = new TwitchClient();
            _client.Initialize(credentials, _options.WatchChannel);

            _client.OnConnectionError += (_, e) =>
            {
                _logger.LogError("Ошибка подключения к Twitch: {0}", e.Error.Message);
                return Task.CompletedTask;
            };
            _client.OnIncorrectLogin += (_, e) =>
            {
                _logger.LogError("Некорректный login: {0}", e.Exception?.Message);
                return Task.CompletedTask;
            };
            _client.OnJoinedChannel += (_, e) =>
            {
                _logger.LogInformation("Присоединился к каналу {0}", e.Channel);
                return Task.CompletedTask;
            };
            _client.OnFailureToReceiveJoinConfirmation += (_, e) =>
            {
                _logger.LogWarning("Не удалось получить подтверждение присоединения: {0}", e.Exception);
                return Task.CompletedTask;
            };

            _client.OnDisconnected += (sender, e) =>
            {
                if (sender != _client)
                {
                    _logger.LogDebug("Игнорирование разрыва соединения со старым клиентом Twitch");
                    return Task.CompletedTask;
                }

                _logger.LogWarning("Соединение с чатом Twitch потеряно");

                _connected = false;

                _ = SafeReconnectAsync(_serviceToken);

                return Task.CompletedTask;
            };

            _client.OnMessageReceived += async (_, e) =>
            {
                try
                {
                    await HandleMessageAsync(e, _serviceToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Ошибка необработанного сообщения Twitch");
                }
            };

            _client.OnConnected += (_, _) =>
            {
                _connected = true;
                _logger.LogInformation("Чат Twitch подключен");
                return Task.CompletedTask;
            };

            await _client.ConnectAsync();
        }
        finally
        {
            _clientLock.Release();
        }
    }

    private async Task ReconnectWithBackoffAsync(CancellationToken ct)
    {
        if (Interlocked.Exchange(ref _reconnecting, 1) == 1)
        {
            _logger.LogInformation("Повторное подключение уже выполняется");
            return;
        }

        try
        {
            var delay = TimeSpan.FromSeconds(2);
            for (int attempt = 0; !ct.IsCancellationRequested && attempt < 10; attempt++)
            {
                try
                {
                    _logger.LogInformation("Вызов инициализации");
                    await InitializeAndConnectClientAsync(ct);
                    if (_connected)
                        return;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Попытка повторного подключения не удалась", attempt + 1);
                }
                await Task.Delay(delay, ct);
                delay = TimeSpan.FromSeconds(Math.Min(60, delay.TotalSeconds * 2));
            }
            // exhausted attempts
            if (!_connected)
            {
                _logger.LogError("Не удалось восстановить подключение к Twitch после исчерпания лимита попыток");
            }
        }
        finally
        {
            Interlocked.Exchange(ref _reconnecting, 0);
        }
    }

    private async Task SafeReconnectAsync(CancellationToken ct)
    {
        try
        {
            await ReconnectWithBackoffAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Не удалось восстановить соединение");
        }
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
            : userName.Trim();
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