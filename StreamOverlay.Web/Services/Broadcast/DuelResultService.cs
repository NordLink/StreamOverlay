using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.SignalR;
using System.Linq;

namespace StreamOverlay.Web.Services.Broadcast
{
    public interface IDuelResultService
    {
        Task ProcessDuelResultAsync(
            string winnerKey,
            string winnerDisplayName,
            string loserKey,
            string loserDisplayName,
            string winnerColor,
            string loserColor,
            DateTime duelTime
        );
        LeaderboardDto GetLeaderboard();
        PlayerStatsDto? GetPlayerStats(string playerKey);
    }

    public class PlayerStats
    {
        public string Name { get; set; } 
        public int Wins { get; set; }
        public int Losses { get; set; }
        public int CurrentStreak { get; set; }
        public int BestStreak { get; set; }
        public string? Color { get; set; }
        public DateTime? LastDuelDate { get; set; }
        public string? Platform { get; set; }
    }

    public class StatsRoot
    {
        [JsonPropertyName("duelStats")]
        public Dictionary<string, PlayerStats> PlayersStat { get; set; } = new();
    }

    public class DuelResultService : IDuelResultService
    {
        private readonly ILogger<DuelResultService> _logger;
        private readonly IHubContext<ChatHub> _hubContext; 
        private readonly string _statsFilePath;
        private readonly object _lock = new();
        private StatsRoot _stats;

        public DuelResultService(ILogger<DuelResultService> logger, IWebHostEnvironment env, IHubContext<ChatHub> hubContext)
        {
            _logger = logger;
            _hubContext = hubContext;
            var dataDir = Path.Combine(env.ContentRootPath, "Data");
            if (!Directory.Exists(dataDir))
                Directory.CreateDirectory(dataDir);
            _statsFilePath = Path.Combine(dataDir, "duelStats.json");
            _stats = LoadFromFile();
        }

        private StatsRoot LoadFromFile()
        {
            if (!File.Exists(_statsFilePath))
                return new StatsRoot();

            try
            {
                var json = File.ReadAllText(_statsFilePath);
                var root = JsonSerializer.Deserialize<StatsRoot>(json);
                return root ?? new StatsRoot();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Не удалось загрузить статистику дуэли из {Path}", _statsFilePath);
                return new StatsRoot();
            }
        }

        private void SaveToFile()
        {
            lock (_lock)
            {
                try
                {
                    var options = new JsonSerializerOptions { WriteIndented = true };
                    var json = JsonSerializer.Serialize(_stats, options);
                    File.WriteAllText(_statsFilePath, json);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Не удалось сохранить статистику дуэли {Path}", _statsFilePath);
                }
            }
        }

        private void UpdateStats(string winnerKey, string winnerDisplayName,
    string loserKey, string loserDisplayName, string winnerColor, string loserColor, DateTime duelTime)
        {
            // Ключи должны быть в нижнем регистре! (например "twitch:nord")
            if (!_stats.PlayersStat.TryGetValue(winnerKey, out var winnerStats))
            {
                winnerStats = new PlayerStats();
                _stats.PlayersStat[winnerKey] = winnerStats;
            }

            if (!_stats.PlayersStat.TryGetValue(loserKey, out var loserStats))
            {
                loserStats = new PlayerStats();
                _stats.PlayersStat[loserKey] = loserStats;
            }

            // Обновляем статистику
            winnerStats.Wins++;
            winnerStats.CurrentStreak++;
            if (winnerStats.CurrentStreak > winnerStats.BestStreak)
                winnerStats.BestStreak = winnerStats.CurrentStreak;

            loserStats.Losses++;
            loserStats.CurrentStreak = 0;

            winnerStats.Name = winnerDisplayName;
            loserStats.Name = loserDisplayName;

            winnerStats.Color = winnerColor;
            loserStats.Color = loserColor;
            winnerStats.Platform = winnerKey.Split(':')[0];
            loserStats.Platform = loserKey.Split(':')[0];
            winnerStats.LastDuelDate = duelTime;
            loserStats.LastDuelDate = duelTime;
        }

        public PlayerStatsDto? GetPlayerStats(string playerKey)  // playerKey = "twitch:nord"
        {
            lock (_lock)
            {
                _stats = LoadFromFile();
                string normalizedKey = playerKey.ToLowerInvariant(); // для регистронезависимости

                if (_stats.PlayersStat.TryGetValue(normalizedKey, out var stats))
                {
                    return new PlayerStatsDto
                    {
                        Name = stats.Name,
                        Wins = stats.Wins,
                        Losses = stats.Losses,
                        CurrentStreak = stats.CurrentStreak,
                        BestStreak = stats.BestStreak,
                        Color = stats.Color,
                        Platform = stats.Platform ?? (normalizedKey.Contains(':') ? normalizedKey.Split(':')[0] : "unknown")
                    };
                }
                return null;
            }
        }

        public LeaderboardDto GetLeaderboard()
        {
            lock (_lock)
            {
                _stats = LoadFromFile();

                var topWins = _stats.PlayersStat
                    .OrderByDescending(kv => kv.Value.Wins)
                    .Take(5)
                    .Select(kv => new LeaderboardEntryDto
                    {
                        Name = kv.Value.Name,
                        Wins = kv.Value.Wins,
                        Losses = kv.Value.Losses,
                        Color = kv.Value.Color,
                        LastDuelDate = kv.Value.LastDuelDate
                    })
                    .ToList();

                var topStreaks = _stats.PlayersStat
                    .Where(kv => kv.Value.BestStreak > 0)
                    .GroupBy(kv => kv.Value.BestStreak)
                    .OrderByDescending(g => g.Key)
                    .Take(3)
                    .Select(g => new LeaderboardStreakGroupDto
                    {
                        Wins = g.Key,
                        Players = g.Select(kv => new LeaderboardStreakPlayerDto
                        {
                            Name = kv.Value.Name,
                            Color = kv.Value.Color ?? "#ffffff"
                        }).ToList()
                    })
                    .ToList();

                return new LeaderboardDto { TopWins = topWins, TopStreaks = topStreaks };
            }
        }

        public async Task ProcessDuelResultAsync(string winnerKey, string winnerDisplayName,
    string loserKey, string loserDisplayName, string winnerColor, string loserColor, DateTime duelTime)
        {
            if (string.IsNullOrEmpty(winnerKey) || string.IsNullOrEmpty(loserKey) || winnerKey == loserKey)
            {
                _logger.LogWarning("Недействительный результат дуэли: ключи пусты или совпадают.");
                return;
            }

            lock (_lock)
            {
                _stats = LoadFromFile();                
                UpdateStats(winnerKey, winnerDisplayName,
                            loserKey, loserDisplayName,
                            winnerColor, loserColor, duelTime);
                SaveToFile();
            }

            var leaderboard = GetLeaderboard();
            await _hubContext.Clients.All.SendAsync("leaderboardUpdate", leaderboard);

            var winnerStats = _stats.PlayersStat[winnerKey];
            _logger.LogInformation("Дуэль сохранена: Победитель {WinnerKey} ({WinnerDisplayName}) [стрик {Streak}] -> Проигравший {LoserKey} ({LoserDisplayName})",
                winnerKey, winnerDisplayName, winnerStats.CurrentStreak, loserKey, loserDisplayName);
        }

    }
}