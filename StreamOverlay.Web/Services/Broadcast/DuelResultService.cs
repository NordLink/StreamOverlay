using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.SignalR;

namespace StreamOverlay.Web.Services.Broadcast
{
    public interface IDuelResultService
    {
        Task ProcessDuelResultAsync(string winnerKey, string loserKey, string winnerColor, string loserColor, DateTime duelTime);
        LeaderboardDto GetLeaderboard();
    }

    public class PlayerStats
    {
        public int Wins { get; set; }
        public int Losses { get; set; }

        [JsonIgnore]
        public int TotalDuels { get => Wins + Losses; }
        public int CurrentStreak { get; set; }
        public int BestStreak { get; set; }
        public string? Color { get; set; } 
        public DateTime? LastDuelDate { get; set; }
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

        private void UpdateStats(string winnerKey, string loserKey, string winnerColor, string loserColor, DateTime duelTime)
        {
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

            winnerStats.Wins++;
            winnerStats.CurrentStreak++;
            if (winnerStats.CurrentStreak > winnerStats.BestStreak)
                winnerStats.BestStreak = winnerStats.CurrentStreak;

            loserStats.Losses++;
            loserStats.CurrentStreak = 0;

            winnerStats.Color = winnerColor;
            loserStats.Color = loserColor;
            winnerStats.LastDuelDate = duelTime;
            loserStats.LastDuelDate = duelTime;
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
                        Name = kv.Key,
                        Wins = kv.Value.Wins,
                        Losses = kv.Value.Losses,
                        Color = kv.Value.Color,
                        LastDuelDate = kv.Value.LastDuelDate
                        // TotalDuels и WinRate вычисляются автоматически из геттеров
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
                            Name = kv.Key,
                            Color = kv.Value.Color ?? "#ffffff"
                        }).ToList()
                    })
                    .ToList();

                return new LeaderboardDto
                {
                    TopWins = topWins,
                    TopStreaks = topStreaks
                };
            }
        }

        public async Task ProcessDuelResultAsync(string winnerKey, string loserKey, string winnerColor, string loserColor, DateTime duelTime)
        {
            if (string.IsNullOrEmpty(winnerKey) || string.IsNullOrEmpty(loserKey) || winnerKey == loserKey)
            {
                _logger.LogWarning("Недействительный результат дуэли");
                return;
            }

            lock (_lock)
            {
                _stats = LoadFromFile();
                UpdateStats(winnerKey, loserKey, winnerColor, loserColor, duelTime);
                SaveToFile();
            }

            var leaderboard = GetLeaderboard();
            await _hubContext.Clients.All.SendAsync("leaderboardUpdate", leaderboard);

            var winnerStats = _stats.PlayersStat[winnerKey];
            _logger.LogInformation("Дуэль: победитель {Winner} (винстрик {Streak}) проигравший {Loser}",
                winnerKey, winnerStats.CurrentStreak, loserKey);
        }
    }
}