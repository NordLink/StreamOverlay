public class OverlayStateService
{
    private OverlayChannelInfoDto? _lastChannelInfo;
    private OverlayViewerCountDto? _lastViewerCount;
    public OverlayChannelInfoDto? LastChannelInfo => _lastChannelInfo;
    public OverlayViewerCountDto? LastViewerCount => _lastViewerCount;
    public void SetChannelInfo(OverlayChannelInfoDto dto)
    {
        _lastChannelInfo = dto;
    }
    public void SetViewerCount(OverlayViewerCountDto dto)
    {
        _lastViewerCount = dto;
    }
}