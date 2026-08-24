using DotNetEnv;
using Microsoft.Extensions.Options;
using StreamOverlay.Web.Services.Broadcast;

Env.Load();

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();
builder.Services.AddControllers();
builder.Services.AddHttpClient();
builder.Services.AddMemoryCache();

builder.Services.Configure<TwitchOptions>(options =>
{
    options.ClientId = builder.Configuration["TWITCH_CLIENT_ID"] ?? "";
    options.ClientSecret = builder.Configuration["TWITCH_CLIENT_SECRET"] ?? "";
    options.WatchChannel = (builder.Configuration["TWITCH_WATCH_CHANNEL"] ?? "").Trim().ToLowerInvariant();
    options.BotUsername = builder.Configuration["TWITCH_BOT_USERNAME"] ?? "";
    options.BotOauth = builder.Configuration["TWITCH_BOT_OAUTH"] ?? "";
    options.RedirectUri = builder.Configuration["TWITCH_REDIRECT_URI"] ?? "https://localhost:7017/auth/twitch/callback";
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
builder.Services.AddSingleton<TwitchAuthService>();
builder.Services.AddSingleton<TwitchBadgeService>();
builder.Services.AddSingleton<ChattersAggregatorService>();
builder.Services.AddHostedService<VkChattersService>();
builder.Services.AddSingleton<TwitchChattersService>();

builder.Services.AddHostedService(sp =>
    sp.GetRequiredService<TwitchChattersService>());
builder.Services.AddSingleton<IVkLiveApiClient, VkLiveApiClient>();
builder.Services.AddHostedService<TwitchChannelInfoService>();
builder.Services.AddHostedService<TwitchChatService>();
builder.Services.AddHostedService<VkChatPollingService>();
builder.Services.AddHostedService<VkViewerPollingService>();
builder.Services.AddSingleton<IComponentConfigService, ComponentConfigService>();
builder.Services.AddSingleton<IDuelResultService, DuelResultService>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var auth = scope.ServiceProvider
        .GetRequiredService<TwitchAuthService>();

    await auth.ValidateTokenAsync(
        CancellationToken.None);
}

app.UseStaticFiles();
app.MapHub<ChatHub>("/chat-hub");

app.MapPageEndpoints();

app.MapControllers();

app.MapFallbackToFile("index.html");

app.Run();