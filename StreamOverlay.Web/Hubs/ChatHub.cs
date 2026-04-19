using Microsoft.AspNetCore.SignalR;
public class ChatHub : Hub
{
    private readonly OverlayStateService _stateService;
    public ChatHub(OverlayStateService stateService)
    {
        _stateService = stateService;
    }
    public override async Task OnConnectedAsync()
    {
        await base.OnConnectedAsync();
        // Получить состояние из общего сервиса
        if (_stateService.LastChannelInfo != null)
        {
            var info = _stateService.LastChannelInfo;
            await Clients.Caller.SendAsync("channelInfo", new
            {
                platform = info.Platform,
                login = info.Login,
                displayName = info.DisplayName
            });
        }
        if (_stateService.LastViewerCount != null)
        {
            var viewers = _stateService.LastViewerCount;
            await Clients.Caller.SendAsync("viewerCount", new
            {
                platform = viewers.Platform,
                count = viewers.Count,
                isLive = viewers.IsLive
            });
        }
    }
}