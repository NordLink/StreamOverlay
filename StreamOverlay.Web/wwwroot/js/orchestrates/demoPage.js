import { ConnectionService } from '../services/connectionService.js';
import { Chat } from '../components/chat.js';
import { ChannelHeader } from '../components/channelHeader.js';
import { ViewerStats } from '../components/viewerStats.js';
import { GameWorld } from '../components/gameworld/gameWorld.js';

(() => {

    const header = new ChannelHeader("channel-name", { staticName: "OneGoldShow" });
    const stats = new ViewerStats("viewers-info");
    const chat = new Chat("chat", {
        maxLines: 11,
        showTime: true,
        showPlatformTag: true,
        showPlatformColor: true
    });


    const logStatus = (connectionStatus) => {
        let statusText = connectionStatus;
        if (connectionStatus === "CONNECTED") {
            statusText = stats.isAnyLive() ? "ONLINE" : "OFFLINE";
        }
        console.log("ConnectionStatus: " + statusText);
    };

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
        if (platform) header.updateChannel(platform, payload?.displayName || payload?.login);
    };

    streamHub.onViewerCountCallback = (payload) => {
        const platform = (payload?.platform || "").toLowerCase();
        if (platform) {
            stats.update(platform, payload?.count, payload?.isLive);
            logStatus(streamHub.status);
        }
    };
    streamHub.onChatMessageCallback = (payload) => {
        chat.appendMessage(payload);
        gameWorld.spawnFromMessage(payload);
    };
    streamHub.onStatusChangeCallback = (status) => logStatus(status);

    header.render();
    stats.render();
    streamHub.start();
})();