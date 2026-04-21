import { ConnectionService } from './services/ConnectionService.js';
import { Chat } from './components/Chat.js';
import { ViewerStats } from './components/ViewerStats.js';

const chat = new Chat("chat", {
    maxLines: 30,
    platformDisplay: 'border' // Варианты: 'tag' или 'border'
});
const stats = new ViewerStats("viewers-info");
const connection = new ConnectionService("/chat-hub");

connection.onChatMessageCallback = (payload) => {
    chat.appendMessage(payload);
};
connection.onViewerCountCallback = (payload) => {
    const platform = (payload?.platform || "").toLowerCase();
    if (platform) {
        stats.update(platform, payload?.count, payload?.isLive);
        logStatus(streamHub.status);
    }
};

connection.start(); 