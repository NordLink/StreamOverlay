import { ConfigService } from '../services/configService.js';
import { ConnectionService } from '../services/connectionService.js';
import { Chat } from '../components/chat.js';
import { ChannelHeader } from '../components/channelHeader.js';
import { ViewerStats } from '../components/viewerStats.js';
import { GameWorld } from '../components/gameworld/gameWorld.js';

(async () => {
    const configService = new ConfigService();
    const config = await configService.getConfigSafe({});

    const header = new ChannelHeader("channel-name", config.channelHeader);

    const streamHub = new ConnectionService("/chat-hub");

    const gameWorld = new GameWorld(
        "world",
        {},
        (duelData) => {
            if (streamHub && streamHub.sendDuelResult) {
                streamHub.sendDuelResult(
                    duelData.winnerKey,
                    duelData.winnerDisplayName,
                    duelData.winnerColor,
                    duelData.loserKey,
                    duelData.loserDisplayName,
                    duelData.loserColor,
                    duelData.timestamp
                );
            }
        },
        streamHub
    );
    gameWorld.init();

    streamHub.onChannelInfoCallback = (payload) => {
        const platform = (payload?.platform || "").toLowerCase();
        if (platform) {
            header.updateChannel(platform, payload?.displayName || payload?.login);
        }
    };

    streamHub.onChatMessageCallback = (payload) => {
        gameWorld.spawnFromMessage(payload);
    };

    header.render();
    await streamHub.start();
})();