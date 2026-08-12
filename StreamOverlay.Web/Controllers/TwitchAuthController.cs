using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

[ApiController]
[Route("auth/twitch")]
public class TwitchAuthController : ControllerBase
{
    private readonly TwitchOptions _options;
    private readonly TwitchAuthService _authService;
    private readonly ILogger<TwitchAuthController> _logger;

    public TwitchAuthController(
        IOptions<TwitchOptions> options,
        TwitchAuthService authService,
        ILogger<TwitchAuthController> logger)
    {
        _options = options.Value;
        _authService = authService;
        _logger = logger;
    }

    [HttpGet("login")]
    public IActionResult Login()
    {
        var scopes =
            "moderator:read:chatters " +
            "channel:read:subscriptions " +
            "chat:read " +
            "chat:edit";

        var url =
            "https://id.twitch.tv/oauth2/authorize" +
            $"?client_id={_options.ClientId}" +
            $"&redirect_uri={Uri.EscapeDataString(_options.RedirectUri)}" +
            "&response_type=code" +
            $"&scope={Uri.EscapeDataString(scopes)}";

        _logger.LogInformation("Twitch OAuth URL: {Url}", url);

        return Redirect(url);
    }

    [HttpGet("callback")]
    public async Task<IActionResult> Callback(
        CancellationToken ct)
    {
        if (Request.Query.TryGetValue("error", out var error))
        {
            var description =
                Request.Query["error_description"].ToString();

            _logger.LogWarning(
                "Twitch OAuth error: {Error}. {Description}",
                error.ToString(),
                description);

            return BadRequest(
                $"Ошибка Twitch OAuth: {error}\n{description}");
        }

        var code = Request.Query["code"].ToString();

        if (string.IsNullOrWhiteSpace(code))
        {
            return BadRequest(
                "В ответе Twitch отсутствует параметр code.");
        }

        var result =
            await _authService.ExchangeCodeForTokenAsync(code, ct);

        if (result == null)
        {
            return Problem(
                "Не удалось обменять code на токены Twitch.");
        }

        _logger.LogInformation(
            "Twitch успешно подключён.");

        return Content("""
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
    }
}