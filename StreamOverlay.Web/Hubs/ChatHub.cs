using Microsoft.AspNetCore.SignalR;
using StreamOverlay.Web.Services.Broadcast;
using TwitchLib.Communication.Interfaces;

public class ChatHub : Hub
{
    private readonly OverlayStateService _stateService;
    private readonly IDuelResultService _duelResultService;
    private readonly ChattersAggregatorService _chattersAggregator;

    public ChatHub(
        OverlayStateService stateService,
        IDuelResultService duelResultService,
        ChattersAggregatorService chattersAggregator)
    {
        _stateService = stateService;
        _duelResultService = duelResultService;
        _chattersAggregator = chattersAggregator;
    }

    public override async Task OnConnectedAsync()
    {
        await base.OnConnectedAsync();

        if (_stateService.LastChannelInfo != null)
        {
            var info = _stateService.LastChannelInfo;

            await Clients.Caller.SendAsync(
                "channelInfo",
                new
                {
                    platform = info.Platform,
                    login = info.Login,
                    displayName = info.DisplayName
                });
        }

        if (_stateService.LastViewerCount != null)
        {
            var viewers = _stateService.LastViewerCount;

            await Clients.Caller.SendAsync(
                "viewerCount",
                new
                {
                    platform = viewers.Platform,
                    count = viewers.Count,
                    isLive = viewers.IsLive
                });
        }
    }

    public async Task RequestViewers()
    {
        var chatters = _chattersAggregator
            .GetViewers()
            .Select(x => new
            {
                userId = x.UserId,
                login = x.Login,
                displayName = x.DisplayName,
                platform = x.Platform,
                detectedAt = x.DetectedAt
            })
            .ToList();

        await Clients.Caller.SendAsync(
            "chattersInitial",
            chatters);
    }

    public async Task RequestLeaderboard()
    {
        var data = _duelResultService.GetLeaderboard();

        await Clients.Caller.SendAsync(
            "leaderboardUpdate",
            data);
    }

    public async Task ReceiveDuelResult(
        string winner,
        string winnerDisplayName,
        string winnerColor,
        string loser,
        string loserDisplayName,
        string loserColor,
        long timestamp)
    {
        var duelTime =
            DateTimeOffset
                .FromUnixTimeMilliseconds(timestamp)
                .UtcDateTime;

        await _duelResultService.ProcessDuelResultAsync(
            winner,
            winnerDisplayName,
            loser,
            loserDisplayName,
            winnerColor,
            loserColor,
            duelTime);
    }

    public async Task RequestPlayerStats(
        string callerKey,
        string playerKey)
    {
        var stats =
            _duelResultService.GetPlayerStats(playerKey);

        await Clients.Caller.SendAsync(
            "playerStats",
            callerKey,
            playerKey,
            stats);
    }
}