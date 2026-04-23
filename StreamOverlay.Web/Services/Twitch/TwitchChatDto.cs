using System.Text.Json.Serialization;
    // Основной DTO входящего сообщения Twitch
public class TwitchChatMessageDto
{
    public bool IsMe { get; set; }
    public bool IsSkippingSubMode { get; set; }
    public string Message { get; set; } = string.Empty;
    public int Noisy { get; set; }
    public string RoomId { get; set; } = string.Empty;
    public int SubscribedMonthCount { get; set; }

    // Может приходить как строка или как DateTimeOffset в зависимости от настроек сериализации
    public DateTimeOffset? TmiSent { get; set; }

    public string? ChatReply { get; set; }
    public object? HypeChat { get; set; }

    // Бэджи и т.д. — пока упрощённо
    public List<BadgeInfoDto> Badges { get; set; } = new();

    public string BotUsername { get; set; } = string.Empty;

    public string HexColor { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public EmoteSetDto EmoteSet { get; set; } = new EmoteSetDto();

    public string UserId { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;

    public UserDetailDto UserDetail { get; set; } = new UserDetailDto();

    public int UserType { get; set; }

    public string RawIrcMessage { get; set; } = string.Empty;

    public UndocumentedTagsDto UndocumentedTags { get; set; } = new UndocumentedTagsDto();

    public string Channel { get; set; } = string.Empty;
    public string Id { get; set; } = string.Empty;

    public bool IsBroadcaster { get; set; }
    public bool IsFirstMessage { get; set; }
    public bool IsHighlighted { get; set; }
}

// Информация об эмотах Twitch (Id, Name и т.д.)
public class EmoteInfo
{
    public string Id { get; set; } = string.Empty;
    public string? Name { get; set; }
}

// Объект EmoteSet из входящего сообщения
public class EmoteSetDto
{
    public List<EmoteInfo> Emotes { get; set; } = new();
    public string RawEmoteSetString { get; set; } = string.Empty;
}

// Бэджи — упрощённая модель (можно расширить под реальный формат, если нужно)
public class BadgeInfoDto
{
    public string Name { get; set; } = string.Empty;
    public string? Version { get; set; }
}

// Детали пользователя
public class UserDetailDto
{
    public bool IsModerator { get; set; }
    public bool IsSubscriber { get; set; }
    public bool HasTurbo { get; set; }
    public bool IsVip { get; set; }
    public bool IsPartner { get; set; }
    public bool IsStaff { get; set; }
}

// Дополнительные undocumented теги
public class UndocumentedTagsDto
{
    [JsonPropertyName("client-nonce")]
    public string? ClientNonce { get; set; }

    public string? Flags { get; set; }

    [JsonPropertyName("returning-chatter")]
    public string? ReturningChatter { get; set; }
}