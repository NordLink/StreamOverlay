using Microsoft.Extensions.Options;

public class VkChattersService : BackgroundService
{
    private readonly IVkLiveApiClient _vkClient;
    private readonly VkLiveOptions _options;
    private readonly ILogger<VkChattersService> _logger;
    private readonly ChattersAggregatorService _chattersAggregator;

    private readonly TimeSpan _refreshInterval =
        TimeSpan.FromSeconds(30);

    public VkChattersService(
        IVkLiveApiClient vkClient,
        IOptions<VkLiveOptions> options,
        ILogger<VkChattersService> logger,
        ChattersAggregatorService chattersAggregator)
    {
        _vkClient = vkClient;
        _options = options.Value;
        _logger = logger;
        _chattersAggregator = chattersAggregator;
    }

    protected override async Task ExecuteAsync(
        CancellationToken stoppingToken)
    {
        if (string.IsNullOrWhiteSpace(_options.ChannelUrl))
        {
            _logger.LogWarning(
                "VK channel не задан. VkChattersService остановлен.");

            return;
        }

        _logger.LogInformation(
            "VkChattersService запущен для канала {Channel}",
            _options.ChannelUrl);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var response =
                    await _vkClient.GetChatMembersAsync(
                        200,
                        stoppingToken);

                if (response != null)
                {
                    var chatters =
                        response.Data.Users
                            .Select(user => new ChattersInfoDto
                            {
                                UserId = user.Id.ToString(),
                                Login = user.Nick,
                                DisplayName = user.Nick,
                                Platform = "vk"
                            })
                            .ToList();

                    await _chattersAggregator
                        .UpdatePlatformChattersAsync(
                            "vk",
                            chatters,
                            stoppingToken);
                }
            }
            catch (OperationCanceledException)
                when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Ошибка VkChattersService");
            }

            try
            {
                await Task.Delay(
                    _refreshInterval,
                    stoppingToken);
            }
            catch (OperationCanceledException)
                when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }

        _logger.LogInformation(
            "VkChattersService остановлен.");
    }
}