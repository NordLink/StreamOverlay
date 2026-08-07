using DotNetEnv;
using Microsoft.Extensions.Options;
using StreamOverlay.Web.Services.Broadcast;

Env.Load();

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();
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
builder.Services.AddHostedService<TwitchViewerService>();
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
app.MapGet("/auth/twitch/login", (IOptions<TwitchOptions> options) =>
{
    var twitch = options.Value;

    var scopes =
        "moderator:read:chatters " +
        "channel:read:subscriptions " +
        "chat:read " +
        "chat:edit";


    var url =
        "https://id.twitch.tv/oauth2/authorize" +
        $"?client_id={twitch.ClientId}" +
        $"&redirect_uri={Uri.EscapeDataString(twitch.RedirectUri)}" +
        "&response_type=code" +
        $"&scope={Uri.EscapeDataString(scopes)}";

    Console.WriteLine(url);
    return Results.Redirect(url);
});

app.MapGet("/auth/twitch/callback",
    async (
        HttpRequest request,
        TwitchAuthService authService,
        ILogger<Program> logger,
        CancellationToken ct) =>
    {
        // Пользователь отказался от авторизации
        if (request.Query.TryGetValue("error", out var error))
        {
            var description = request.Query["error_description"].ToString();

            logger.LogWarning(
                "Twitch OAuth error: {Error}. {Description}",
                error.ToString(),
                description);

            return Results.BadRequest(
                $"Ошибка Twitch OAuth: {error}\n{description}");
        }

        var code = request.Query["code"].ToString();

        if (string.IsNullOrWhiteSpace(code))
        {
            return Results.BadRequest("В ответе Twitch отсутствует параметр code.");
        }

        var result = await authService.ExchangeCodeForTokenAsync(code, ct);

        if (result == null)
        {
            return Results.Problem("Не удалось обменять code на токены Twitch.");
        }

        logger.LogInformation("Twitch успешно подключён.");

        // Пока можно вернуть простую страницу
        return Results.Content("""
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Twitch подключён</title>
</head>
<body style="font-family:Arial;padding:40px;">
<h2>✅ Twitch успешно подключён!</h2>

<p>Refresh Token сохранён.</p>

<p>Теперь можно закрыть эту вкладку.</p>

<a href="/">Вернуться на главную</a>
</body>
</html>
""", "text/html");
    });

app.MapFallbackToFile("index.html");


//using (var scope = app.Services.CreateScope())
//{
//    var authService = scope.ServiceProvider.GetRequiredService<TwitchAuthService>();

//    await authService.ValidateTokenAsync(CancellationToken.None);
//}
app.Run();