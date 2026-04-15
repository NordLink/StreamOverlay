using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
public interface IVkLiveApiClient
{
    Task<VkMessagesResponse?> GetMessagesAsync(int limit, CancellationToken ct);
    Task<(int Count, bool IsLive)> GetViewersCountAsync(CancellationToken ct);
}
public class VkLiveApiClient : IVkLiveApiClient
{
    private const string BaseUrl = "https://apidev.live.vkvideo.ru/";
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly VkLiveOptions _options;
    private readonly ILogger<VkLiveApiClient> _logger;
    public VkLiveApiClient(
        IHttpClientFactory httpClientFactory,
        IOptions<VkLiveOptions> options,
        ILogger<VkLiveApiClient> logger)
    {
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<VkMessagesResponse?> GetMessagesAsync(int limit, CancellationToken ct)
    {
        if (!IsConfigured())
            return null;
        var query = new Dictionary<string, string?>
        {
            ["channel_url"] = _options.ChannelUrl,
            ["limit"] = NormalizeLimit(limit).ToString()
        };
        using var request = CreateGetRequest("v1/chat/messages", query);
        var http = _httpClientFactory.CreateClient();
        using var response = await http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync(ct);
            _logger.LogWarning("VK messages API error: {StatusCode}. {Body}", response.StatusCode, error);
            return null;
        }
        var json = await response.Content.ReadAsStringAsync(ct);

        return Helper.Deserialize<VkMessagesResponse>(json);
    }

    public async Task<(int Count, bool IsLive)> GetViewersCountAsync(CancellationToken ct)
    {
        if (!IsConfigured())
            return (0, false);
        var query = new Dictionary<string, string?>
        {
            ["channel_url"] = _options.ChannelUrl
        };
        using var request = CreateGetRequest("/v1/channel", query);
        var http = _httpClientFactory.CreateClient();
        using var response = await http.SendAsync(request, ct);
       
        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync(ct);
            _logger.LogWarning("VK members API error: {StatusCode}. {Body}", response.StatusCode, error);
            return (0, false);
        }
        var json = await response.Content.ReadAsStringAsync(ct);

        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            if (root.TryGetProperty("data", out var data) &&
                data.TryGetProperty("stream", out var stream) &&
                stream.ValueKind != JsonValueKind.Null)
            {
                if (stream.TryGetProperty("counters", out var counters) &&
                    counters.TryGetProperty("viewers", out var viewers))
                {
                    int count = viewers.GetInt32();
                    bool isLive = stream.GetProperty("status").GetString() == "online";

                    return (count, isLive);
                }
            }
            return (0, false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка парсинга VK viewers response.");
            return (0, false);
        }
    }
    private HttpRequestMessage CreateGetRequest(string relativeUrl, Dictionary<string, string?> query)
    {
        var url = QueryHelpers.AddQueryString($"{BaseUrl}{relativeUrl}", query);
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        var base64Credentials = Convert.ToBase64String(
            Encoding.ASCII.GetBytes($"{_options.AppId}:{_options.SecretKey}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", base64Credentials);
        return request;
    }
    private int NormalizeLimit(int limit)
    {
        if (limit < 1) return 1;
        if (limit > 200) return 200;
        return limit;
    }
    private bool IsConfigured()
    {
        if (string.IsNullOrWhiteSpace(_options.ChannelUrl) ||
            string.IsNullOrWhiteSpace(_options.AppId) ||
            string.IsNullOrWhiteSpace(_options.SecretKey))
        {
            _logger.LogWarning("VK config не заполнен полностью.");
            return false;
        }
        return true;
    }
    private static int ExtractCount(JsonElement element)
    {
        string[] numericKeys =
        {
            "count", "total", "total_count", "members_count", "viewers_count"
        };
        string[] arrayKeys =
        {
            "chat_members", "members", "items", "users", "viewers"
        };
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var key in numericKeys)
            {
                if (element.TryGetProperty(key, out var numeric) &&
                    numeric.ValueKind == JsonValueKind.Number &&
                    numeric.TryGetInt32(out var numericValue))
                {
                    return numericValue;
                }
            }
            foreach (var key in arrayKeys)
            {
                if (element.TryGetProperty(key, out var array) &&
                    array.ValueKind == JsonValueKind.Array)
                {
                    return array.GetArrayLength();
                }
            }
            foreach (var prop in element.EnumerateObject())
            {
                int nested = ExtractCount(prop.Value);
                if (nested > 0)
                    return nested;
            }
        }
        if (element.ValueKind == JsonValueKind.Array)
            return element.GetArrayLength();
        return 0;
    }
}