using DotNetEnv;

var builder = WebApplication.CreateBuilder(args);

Env.Load();

builder.Services.AddSignalR();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<TwitchTokenProvider>();
builder.Services.AddHostedService<TwitchChannelInfoService>();
builder.Services.AddHostedService<TwitchChatService>();

var app = builder.Build();

app.UseStaticFiles();
app.MapHub<ChatHub>("/chat");
app.MapFallbackToFile("index.html");
app.Run();