using Microsoft.AspNetCore.SignalR;

public interface IOverlayBroadcastService
{
    Task SendChannelInfoAsync(
        OverlayChannelInfoDto dto,
        CancellationToken ct);

    Task SendViewerCountAsync(
        OverlayViewerCountDto dto,
        CancellationToken ct);

    Task SendChatMessageAsync(
        OverlayChatMessageDto dto,
        CancellationToken ct);

    Task SendViewerJoinedAsync(
        OverlayViewerDto dto,
        CancellationToken ct);

    Task SendViewerLeftAsync(
        OverlayViewerLeftDto dto,
        CancellationToken ct);
}


public class SignalROverlayBroadcastService : IOverlayBroadcastService
{
    private readonly IHubContext<ChatHub> _hub;
    private readonly OverlayStateService _stateService;


    public SignalROverlayBroadcastService(
        IHubContext<ChatHub> hub,
        OverlayStateService stateService)
    {
        _hub = hub;
        _stateService = stateService;
    }


    public Task SendChannelInfoAsync(
        OverlayChannelInfoDto dto,
        CancellationToken ct)
    {
        _stateService.SetChannelInfo(dto);

        return _hub.Clients.All.SendAsync(
            "channelInfo",
            new
            {
                platform = dto.Platform,
                login = dto.Login,
                displayName = dto.DisplayName
            },
            ct);
    }


    public Task SendViewerCountAsync(
        OverlayViewerCountDto dto,
        CancellationToken ct)
    {
        _stateService.SetViewerCount(dto);

        return _hub.Clients.All.SendAsync(
            "viewerCount",
            new
            {
                platform = dto.Platform,
                count = dto.Count,
                isLive = dto.IsLive
            },
            ct);
    }


    public Task SendChatMessageAsync(
        OverlayChatMessageDto dto,
        CancellationToken ct)
    {
        return _hub.Clients.All.SendAsync(
            "chatMessage",
            new
            {
                platform = dto.Platform,
                user = dto.User,
                userId = dto.UserId,
                message = dto.Message,
                color = dto.Color,
                emotes = dto.Emotes,
                badges = dto.Badges,
                time = dto.SendTime,
                highlighted = dto.IsHighlighted
            },
            ct);
    }

    public Task SendViewerJoinedAsync(
        OverlayViewerDto dto,
        CancellationToken ct)
    {
        return _hub.Clients.All.SendAsync(
            "viewerJoined",
            new
            {
                login = dto.Login,
                displayName = dto.DisplayName,
                detectedAt = dto.DetectedAt
            },
            ct);
    }

    public Task SendViewerLeftAsync(
        OverlayViewerLeftDto dto,
        CancellationToken ct)
    {
        return _hub.Clients.All.SendAsync(
            "viewerLeft",
            new
            {
                login = dto.Login
            },
            ct);
    }
}