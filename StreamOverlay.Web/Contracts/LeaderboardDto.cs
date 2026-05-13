using System.Collections.Generic;

public class LeaderboardEntryDto
{
    public string Name { get; set; }
    public int Wins { get; set; }
    public int Losses { get; set; }
    public int TotalDuels => Wins + Losses;
    public int WinRate => TotalDuels == 0 ? 0 : (int)Math.Round((double)Wins / TotalDuels * 100);
    public string? Color { get; set; }
    public DateTime? LastDuelDate { get; set; }
}
public class LeaderboardStreakPlayerDto
{
    public string Name { get; set; }
    public string Color { get; set; }
}
public class LeaderboardStreakGroupDto
{
    public int Wins { get; set; }
    public List<LeaderboardStreakPlayerDto> Players { get; set; }
}


public class LeaderboardDto
{
    public List<LeaderboardEntryDto> TopWins { get; set; }
    public List<LeaderboardStreakGroupDto> TopStreaks { get; set; }
}


public class PlayerStatsDto
{
    public string Name { get; set; } 
    public int Wins { get; set; }
    public int Losses { get; set; }
    public int TotalDuels => Wins + Losses;
    public int WinRate => TotalDuels == 0 ? 0 : (int)Math.Round((double)Wins / TotalDuels * 100);
    public int CurrentStreak { get; set; }
    public int BestStreak { get; set; }
    public string? Color { get; set; }
}