using System.Text.Json.Serialization;

public record OverlayEmoteDto(
    string Id,
    string Name,
    string Url
 );

public record OverlayChannelInfoDto(
    string Platform,
    string Login,
    string DisplayName
);
public record OverlayViewerCountDto(
    string Platform,
    int Count,
    bool IsLive
);
public record OverlayChatMessageDto(
    string Platform,
    string User,
    string Message,
    string? Color,
    string? UserId = null,
    string? SendTime = null,
    List<OverlayEmoteDto>? Emotes = null,
    List<string>? Badges = null,
    bool? IsHighlighted = false
 );

public record OverlayChatterInfoDto(
    string UserId,
    string Login,
    string DisplayName,
    string Platform,
    DateTime DetectedAt
);

public record OverlayChatterLeftDto(
    string UserId,
    string Login,
    string Platform
);

public class ChattersInfoDto
{
    public string UserId { get; init; } = "";
    public string Login { get; init; } = "";
    public string DisplayName { get; init; } = "";
    public string Platform { get; init; } = "";
    public DateTime DetectedAt { get; set; }
}

