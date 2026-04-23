import { ConnectionService } from './services/ConnectionService.js';
import { Chat } from './components/Chat.js';
import { ChannelHeader } from './components/ChannelHeader.js';
import { ViewerStats } from './components/ViewerStats.js';
import { Characters } from './components/Characters.js';

(() => {
    // Инициализация компонентов
    const header = new ChannelHeader("channel-name", { staticName: "OneGoldShow" });
    //const stats = new ViewerStats("viewers-info");
    //const chat = new Chat("chat", 30);

    const characterWorld = new Characters("world");
    characterWorld.init();
    //const logStatus = (connectionStatus) => {
    //    let statusText = connectionStatus;
    //    if (connectionStatus === "CONNECTED") {
    //        statusText = stats.isAnyLive() ? "ONLINE" : "OFFLINE";
    //    }
    //    console.log("ConnectionStatus: " + statusText);
    //};
    // Инициализация SignalR
    const streamHub = new ConnectionService("/chat-hub");

    streamHub.onChannelInfoCallback = (payload) => {
        const platform = (payload?.platform || "").toLowerCase();
        if (platform) header.updateChannel(platform, payload?.displayName || payload?.login);
    };
    //streamHub.onViewerCountCallback = (payload) => {
    //    const platform = (payload?.platform || "").toLowerCase();
    //    if (platform) {
    //        stats.update(platform, payload?.count, payload?.isLive);
    //        logStatus(streamHub.status);
    //    }
    //};
    streamHub.onChatMessageCallback = (payload) => {
        //chat.appendMessage(payload);
        characterWorld.spawnFromMessage(payload);
    };
    //streamHub.onStatusChangeCallback = (status) => logStatus(status);
 
    header.render();
    //stats.render();
    streamHub.start();
})();