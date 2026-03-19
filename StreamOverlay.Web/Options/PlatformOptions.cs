public class TwitchOptions
{
    public string ClientId { get; set; } = "";
    public string ClientSecret { get; set; } = "";
    public string WatchChannel { get; set; } = "";
    public string BotUsername { get; set; } = "";
    public string BotOauth { get; set; } = "";
}
public class VkLiveOptions
{
    public string ChannelUrl { get; set; } = "";
    public string AppId { get; set; } = "";
    public string SecretKey { get; set; } = "";
    public int ChatPollingSeconds { get; set; } = 2;
    public int ViewersPollingSeconds { get; set; } = 15;
}
