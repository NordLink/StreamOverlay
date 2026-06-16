using DotNetEnv;
using StreamOverlay.Web.Services.Broadcast;

Env.Load();

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();
builder.Services.AddHttpClient();

builder.Services.Configure<TwitchOptions>(options =>
{
    options.ClientId = builder.Configuration["TWITCH_CLIENT_ID"] ?? "";
    options.ClientSecret = builder.Configuration["TWITCH_CLIENT_SECRET"] ?? "";
    options.WatchChannel = (builder.Configuration["TWITCH_WATCH_CHANNEL"] ?? "").Trim().ToLowerInvariant();
    options.BotUsername = builder.Configuration["TWITCH_BOT_USERNAME"] ?? "";
    options.BotOauth = builder.Configuration["TWITCH_BOT_OAUTH"] ?? "";
});

builder.Services.Configure<VkLiveOptions>(options =>
{
    options.ChannelUrl =
        builder.Configuration["VK_LIVE_CHANNEL_URL"]
        ?? builder.Configuration["LiveVkVideo:ChannelUrl"]
        ?? "";
    options.AppId =
        builder.Configuration["VK_LIVE_APP_ID"]
        ?? builder.Configuration["LiveVkVideo:AppId"]
        ?? "";
    options.SecretKey =
        builder.Configuration["VK_LIVE_SECRET_KEY"]
        ?? builder.Configuration["LiveVkVideo:SecretKey"]
        ?? "";
    options.ChatPollingSeconds = int.TryParse(builder.Configuration["VK_POLLING_SECONDS"], out var chatSeconds)
        ? Math.Max(1, chatSeconds)
        : 2;
    options.ViewersPollingSeconds = int.TryParse(builder.Configuration["VK_VIEWERS_POLLING_SECONDS"], out var viewersSeconds)
        ? Math.Max(2, viewersSeconds)
        : 15;
});

builder.Services.AddSingleton<IOverlayBroadcastService, SignalROverlayBroadcastService>();
builder.Services.AddSingleton<OverlayStateService>();
builder.Services.AddSingleton<TwitchTokenProvider>();
builder.Services.AddSingleton<IVkLiveApiClient, VkLiveApiClient>();
builder.Services.AddHostedService<TwitchChannelInfoService>();
builder.Services.AddHostedService<TwitchChatService>();
builder.Services.AddHostedService<VkChatPollingService>();
builder.Services.AddHostedService<VkViewerPollingService>();
builder.Services.AddSingleton<IComponentConfigService, ComponentConfigService>();
builder.Services.AddSingleton<IDuelResultService, DuelResultService>();

var app = builder.Build();

app.UseStaticFiles();
app.MapHub<ChatHub>("/chat-hub");

app.MapGet("/", () => Results.File("pages/index.html", "text/html"));
app.MapGet("/demo", () => Results.File("pages/demo.html", "text/html"));
app.MapGet("/overlay", () => Results.File("pages/overlay.html", "text/html"));
app.MapGet("/chat", () => Results.File("pages/chat.html", "text/html"));
app.MapGet("/viewers", () => Results.File("pages/viewers.html", "text/html"));
app.MapGet("/dueldisplay", () => Results.File("pages/duelDisplay.html", "text/html"));
app.MapGet("/api/config", async (IComponentConfigService configService) =>
{
    var json = await configService.GetConfigAsync();
    return Results.Content(json, "application/json");
});

app.MapFallbackToFile("index.html");
app.Run();