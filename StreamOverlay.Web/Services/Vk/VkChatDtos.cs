using System.Text.Json.Serialization;
public class VkMessagesResponse
{
    [JsonPropertyName("data")]
    public VkMessagesData? Data { get; set; }
}
public class VkMessagesData
{
    [JsonPropertyName("chat_messages")]
    public List<VkChatMessage>? ChatMessages { get; set; }
}
public class VkChatMessage
{
    [JsonPropertyName("author")]
    public VkAuthor? Author { get; set; }
    [JsonPropertyName("created_at")]
    public long CreatedAt { get; set; }
    [JsonPropertyName("id")]
    public long Id { get; set; }
    [JsonPropertyName("is_private")]
    public bool IsPrivate { get; set; }
    [JsonPropertyName("parts")]
    public List<VkPart>? Parts { get; set; }
}
public class VkAuthor
{
    [JsonPropertyName("avatar_url")]
    public string? AvatarUrl { get; set; }
    [JsonPropertyName("id")]
    public long Id { get; set; }
    [JsonPropertyName("is_moderator")]
    public bool IsModerator { get; set; }
    [JsonPropertyName("is_owner")]
    public bool IsOwner { get; set; }
    [JsonPropertyName("nick")]
    public string? Nick { get; set; }
    [JsonPropertyName("nick_color")]
    public int NickColor { get; set; }
}
public class VkPart
{
    [JsonPropertyName("link")]
    public VkLinkPart? Link { get; set; }
    [JsonPropertyName("mention")]
    public VkMentionPart? Mention { get; set; }
    [JsonPropertyName("smile")]
    public VkSmilePart? Smile { get; set; }
    [JsonPropertyName("text")]
    public VkTextPart? Text { get; set; }
}
public class VkLinkPart
{
    [JsonPropertyName("content")]
    public string? Content { get; set; }
    [JsonPropertyName("url")]
    public string? Url { get; set; }
}
public class VkMentionPart
{
    [JsonPropertyName("id")]
    public long Id { get; set; }
    [JsonPropertyName("nick")]
    public string? Nick { get; set; }
}
public class VkSmilePart
{
    [JsonPropertyName("animated")]
    public bool Animated { get; set; }
    [JsonPropertyName("id")]
    public string? Id { get; set; }
    [JsonPropertyName("name")]
    public string? Name { get; set; }
    [JsonPropertyName("small_url")]
    public string? SmallUrl { get; set; }
    [JsonPropertyName("medium_url")]
    public string? MediumUrl { get; set; }
    [JsonPropertyName("large_url")]
    public string? LargeUrl { get; set; }
}
public class VkTextPart
{
    [JsonPropertyName("content")]
    public string? Content { get; set; }
}
public class VkChatMembersResponse
{
    [JsonPropertyName("data")]
    public VkChatMembersData Data { get; set; } = new();
}

public class VkChatMembersData
{
    [JsonPropertyName("users")]
    public List<VkChatMember> Users { get; set; } = new();
}

public class VkChatMember
{
    [JsonPropertyName("avatar_url")]
    public string AvatarUrl { get; set; } = "";

    [JsonPropertyName("id")]
    public long Id { get; set; }

    [JsonPropertyName("is_moderator")]
    public bool IsModerator { get; set; }

    [JsonPropertyName("is_owner")]
    public bool IsOwner { get; set; }

    [JsonPropertyName("nick")]
    public string Nick { get; set; } = "";

    [JsonPropertyName("nick_color")]
    public int NickColor { get; set; }
}