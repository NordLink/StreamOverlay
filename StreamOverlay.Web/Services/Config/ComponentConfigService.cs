public interface IComponentConfigService
{
    Task<string> GetConfigAsync();
}

public class ComponentConfigService : IComponentConfigService
{
    private readonly string _filePath;

    public ComponentConfigService(IHostEnvironment env)
    {
        _filePath = Path.Combine(env.ContentRootPath, "Data", "componentConfig.json");
    }

    public async Task<string> GetConfigAsync()
    {
        if (!File.Exists(_filePath))
        {
            return "{}";
        }

        return await File.ReadAllTextAsync(_filePath);
    }
}
