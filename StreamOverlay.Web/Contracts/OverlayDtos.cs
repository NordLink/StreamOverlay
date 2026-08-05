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
    string? SendTime = null,
    List<OverlayEmoteDto>? Emotes = null,
    List<string>? Badges = null,
    bool? IsHighlighted = false
 );

