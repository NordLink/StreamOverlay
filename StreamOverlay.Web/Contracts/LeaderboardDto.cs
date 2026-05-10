using System.Collections.Generic;

public class LeaderboardEntryDto
{
    public string Name { get; set; }
    public int Wins { get; set; }
    public int Losses { get; set; }
}

public class LeaderboardDto
{
    public List<LeaderboardEntryDto> TopWins { get; set; }
    public LeaderboardEntryDto TopStreak { get; set; }
}