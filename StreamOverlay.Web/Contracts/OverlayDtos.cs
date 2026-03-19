public record OverlayChannelInfoDto(string Platform, string Login, string DisplayName);
public record OverlayViewerCountDto(string Platform, int Count, bool IsLive);
public record OverlayChatMessageDto(string Platform, string User, string Message, string? Color);
