using Microsoft.Extensions.Options;
public class VkViewerPollingService : BackgroundService
{
    private readonly IVkLiveApiClient _vkClient;
    private readonly IOverlayBroadcastService _broadcast;
    private readonly VkLiveOptions _options;
    private readonly ILogger<VkViewerPollingService> _logger;
    public VkViewerPollingService(
        IVkLiveApiClient vkClient,
        IOverlayBroadcastService broadcast,
        IOptions<VkLiveOptions> options,
        ILogger<VkViewerPollingService> logger)
    {
        _vkClient = vkClient;
        _broadcast = broadcast;
        _options = options.Value;
        _logger = logger;
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (string.IsNullOrWhiteSpace(_options.ChannelUrl))
        {
            _logger.LogWarning("VK channel не задан. VkViewerPollingService остановлен.");
            return;
        }
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var (count, isLive) = await _vkClient.GetViewersCountAsync(stoppingToken);
                await _broadcast.SendViewerCountAsync(
                    new OverlayViewerCountDto("vk", count, isLive),
                    stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Ошибка в VkViewerPollingService.");
            }
            await Task.Delay(TimeSpan.FromSeconds(_options.ViewersPollingSeconds), stoppingToken);
        }
    }
}