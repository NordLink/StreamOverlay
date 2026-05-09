using System.Text.Json;
using System.Text.Json.Serialization;

namespace StreamOverlay.Web.Services.Broadcast
{
    public interface IDuelResultService
    {
        Task ProcessDuelResultAsync(string winnerKey, string loserKey);
    }

    public class PlayerStats
    {
        public int Wins { get; set; }
        public int Losses { get; set; }
        public int TotalDuels { get => Wins + Losses; }
        public int CurrentStreak { get; set; }
        public int BestStreak { get; set; }
    }

    public class StatsRoot
    {
        [JsonPropertyName("duelStats")]
        public Dictionary<string, PlayerStats> PlayersStat { get; set; } = new();
    }

    public class DuelResultService : IDuelResultService
    {
        private readonly ILogger<DuelResultService> _logger;
        private readonly string _statsFilePath;
        private readonly object _lock = new();

        // Данные в памяти для быстрого доступа
        private StatsRoot _stats;

        public DuelResultService(ILogger<DuelResultService> logger, IWebHostEnvironment env)
        {
            _logger = logger;
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

        // Обновление статистики (вызывается под локом)
        private void UpdateStats(string winnerKey, string loserKey)
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

        }

        public Task ProcessDuelResultAsync(string winnerKey, string loserKey)
        {
            if (string.IsNullOrEmpty(winnerKey) || string.IsNullOrEmpty(loserKey) || winnerKey == loserKey)
            {
                _logger.LogWarning("Недействительный результат дуэли: winner={Winner}, loser={Loser}", winnerKey, loserKey);
                return Task.CompletedTask;
            }

            lock (_lock)
            {
                // Перезагружаем на случай внешних изменений (если другой процесс редактировал файл)
                _stats = LoadFromFile();

                UpdateStats(winnerKey, loserKey);

                var winnerStats = _stats.PlayersStat[winnerKey];
                _logger.LogInformation("Дуэль: победитель {Winner} (винстрик {Streak}) проигравший {Loser}",
                    winnerKey, winnerStats.CurrentStreak, loserKey);
                Console.WriteLine($"Результат дуэли сохранен: {winnerKey} (винстрик {winnerStats.CurrentStreak}) побежден {loserKey}");

                SaveToFile();
            }

            return Task.CompletedTask;
        }
    }
}