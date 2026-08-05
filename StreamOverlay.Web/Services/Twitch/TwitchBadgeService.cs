using System.Text.Json;
using System.Linq;
using System.Collections.Generic;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

public class TwitchBadgeService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly TwitchAuthService _authService;
    private readonly TwitchOptions _options;
    private readonly ILogger<TwitchBadgeService> _logger;
    private readonly IMemoryCache _cache;

    public TwitchBadgeService(
        IHttpClientFactory httpClientFactory,
        TwitchAuthService authService,
        IOptions<TwitchOptions> options,
        ILogger<TwitchBadgeService> logger,
        IMemoryCache cache)
    {
        _httpClientFactory = httpClientFactory;
        _authService = authService;
        _options = options.Value;
        _logger = logger;
        _cache = cache;
    }

    public async Task<string?> GetBadgeUrlAsync(string setId, string? version, string? broadcasterLogin, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(setId) || string.IsNullOrWhiteSpace(version))
            return null;

        if (!string.IsNullOrWhiteSpace(broadcasterLogin))
        {
            var broadcasterKey = $"badges_broadcaster_{broadcasterLogin}";
            if (_cache.TryGetValue<BadgeSet[]>(broadcasterKey, out var broadcasterSets))
            {
                var set = broadcasterSets.FirstOrDefault(s => s.SetId == setId);
                if (set != null)
                {
                    var ver = set.Versions.FirstOrDefault(v => v.Id == version);
                    var url = ver?.ImageUrl1x ?? ver?.ImageUrl2x ?? ver?.ImageUrl4x;
                    if (!string.IsNullOrWhiteSpace(url))
                        return url;
                }
            }
        }

        var key = $"badge_{setId}";
        if (!_cache.TryGetValue<BadgeSet[]>(key, out var sets))
        {
            sets = await LoadGlobalBadgesAsync(ct);
            if (sets != null)
                _cache.Set(key, sets, TimeSpan.FromHours(6));
        }

        if (sets == null)
            return null;

        var globalSet = sets.FirstOrDefault(s => s.SetId == setId);
        if (globalSet == null)
            return null;
        var gver = globalSet.Versions.FirstOrDefault(v => v.Id == version);
        return gver?.ImageUrl1x ?? gver?.ImageUrl2x ?? gver?.ImageUrl4x;
    }

    private async Task<BadgeSet[]?> LoadGlobalBadgesAsync(CancellationToken ct)
    {
        try
        {
            var token = await _authService.GetClientCredentialsAsync(ct);
            if (token is null)
            {
                _logger.LogWarning("No app token available for badges API");
                return null;
            }
            var http = _httpClientFactory.CreateClient();
            using var req = new HttpRequestMessage(HttpMethod.Get, "https://api.twitch.tv/helix/chat/badges/global");
            req.Headers.Add("Client-Id", _options.ClientId);
            req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token.AccessToken);
            using var resp = await http.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("Не удалось загрузить глобальный значки: {Status}", resp.StatusCode);
                return null;
            }
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
            var data = doc.RootElement.GetProperty("data");
            var list = new List<BadgeSet>();
            foreach (var el in data.EnumerateArray())
            {
                var setId = el.GetProperty("set_id").GetString() ?? string.Empty;
                var versions = new List<BadgeVersion>();
                foreach (var v in el.GetProperty("versions").EnumerateArray())
                {
                    versions.Add(new BadgeVersion(
                        v.GetProperty("id").GetString() ?? string.Empty,
                        v.GetProperty("image_url_1x").GetString(),
                        v.GetProperty("image_url_2x").GetString(),
                        v.GetProperty("image_url_4x").GetString()
                    ));
                }
                list.Add(new BadgeSet(setId, versions.ToArray()));
            }
            return list.ToArray();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Ошибка загрузки глобальных значков");
            return null;
        }
    }

    public async Task<BadgeSet[]?> LoadBroadcasterBadgesAsync(string broadcasterLogin, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(broadcasterLogin))
            return null;

        var cacheKey = $"badges_broadcaster_{broadcasterLogin}";
        if (_cache.TryGetValue<BadgeSet[]>(cacheKey, out var cached))
            return cached;

        try
        {
            var token = await _authService.GetClientCredentialsAsync(ct);
            if (token is null)
            {
                _logger.LogWarning("No app token available for broadcaster badges API");
                return null;
            }
            var http = _httpClientFactory.CreateClient();

            using var userReq = new HttpRequestMessage(HttpMethod.Get, $"https://api.twitch.tv/helix/users?login={broadcasterLogin}");
            userReq.Headers.Add("Client-Id", _options.ClientId);
            userReq.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token.AccessToken);
            using var userResp = await http.SendAsync(userReq, ct);
            if (!userResp.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to resolve broadcaster id: {Status}", userResp.StatusCode);
                return null;
            }
            using var userDoc = JsonDocument.Parse(await userResp.Content.ReadAsStringAsync(ct));
            var userData = userDoc.RootElement.GetProperty("data");
            if (userData.GetArrayLength() == 0)
                return null;
            var broadcasterId = userData[0].GetProperty("id").GetString();
            if (string.IsNullOrWhiteSpace(broadcasterId))
                return null;

            using var req = new HttpRequestMessage(HttpMethod.Get, $"https://api.twitch.tv/helix/chat/badges?broadcaster_id={broadcasterId}");
            req.Headers.Add("Client-Id", _options.ClientId);
            req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token.AccessToken);
            using var resp = await http.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("Не удалось загрузить значки стримера: {Status}", resp.StatusCode);
                return null;
            }
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
            var data = doc.RootElement.GetProperty("data");
            var list = new List<BadgeSet>();
            foreach (var el in data.EnumerateArray())
            {
                var setId = el.GetProperty("set_id").GetString() ?? string.Empty;
                var versions = new List<BadgeVersion>();
                foreach (var v in el.GetProperty("versions").EnumerateArray())
                {
                    versions.Add(new BadgeVersion(
                        v.GetProperty("id").GetString() ?? string.Empty,
                        v.GetProperty("image_url_1x").GetString(),
                        v.GetProperty("image_url_2x").GetString(),
                        v.GetProperty("image_url_4x").GetString()
                    ));
                }
                list.Add(new BadgeSet(setId, versions.ToArray()));
            }
            var arr = list.ToArray();
            _cache.Set(cacheKey, arr, TimeSpan.FromHours(6));
            return arr;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Ошибка загрузки значков стримера");
            return null;
        }
    }

    public record BadgeSet(string SetId, BadgeVersion[] Versions);
    public record BadgeVersion(string Id, string? ImageUrl1x, string? ImageUrl2x, string? ImageUrl4x);
}
