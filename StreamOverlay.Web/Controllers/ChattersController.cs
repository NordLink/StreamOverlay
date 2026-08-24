using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class ChattersController : ControllerBase
{
    private readonly ChattersAggregatorService _chattersAggregator;

    public ChattersController(
        ChattersAggregatorService chattersAggregator)
    {
        _chattersAggregator = chattersAggregator;
    }

    [HttpGet]
    public IActionResult GetViewers()
    {
        var chatters = _chattersAggregator.GetViewers();

        return Ok(chatters);
    }
}