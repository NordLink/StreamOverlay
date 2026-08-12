public static class PageEndpoints
{
    public static void MapPageEndpoints(
        this WebApplication app)
    {
        app.MapGet("/", () =>
            Results.File(
                "pages/index.html",
                "text/html"));

        app.MapGet("/demo", () =>
            Results.File(
                "pages/demo.html",
                "text/html"));

        app.MapGet("/overlay", () =>
            Results.File(
                "pages/overlay.html",
                "text/html"));

        app.MapGet("/chat", () =>
            Results.File(
                "pages/chat.html",
                "text/html"));

        app.MapGet("/viewers", () =>
            Results.File(
                "pages/viewers.html",
                "text/html"));

        app.MapGet("/chatters", () =>
           Results.File(
               "pages/chatters.html",
               "text/html"));

        app.MapGet("/dueldisplay", () =>
            Results.File(
                "pages/duelDisplay.html",
                "text/html"));
    }
}
