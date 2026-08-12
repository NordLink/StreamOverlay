using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class ConfigController : ControllerBase
{
    private readonly IComponentConfigService _configService;

    public ConfigController(
        IComponentConfigService configService)
    {
        _configService = configService;
    }

    [HttpGet]
    public async Task<IActionResult> GetConfig()
    {
        var json = await _configService.GetConfigAsync();

        return Content(
            json,
            "application/json");
    }
}
