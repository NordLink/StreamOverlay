using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class ChattersController : ControllerBase
{
    private readonly TwitchViewerService _twitchViewerService;

    public ChattersController(
        TwitchViewerService twitchViewerService)
    {
        _twitchViewerService = twitchViewerService;
    }

    [HttpGet]
    public IActionResult GetViewers()
    {
        var twitchViewers = _twitchViewerService.GetViewers();

        return Ok(twitchViewers);
    }
}