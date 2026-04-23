import { ConnectionService } from './services/ConnectionService.js';
import { ViewerStats } from './components/ViewerStats.js';

const stats = new ViewerStats("viewers-info");
const connection = new ConnectionService("/chat-hub");

connection.onViewerCountCallback = (payload) => {
    const platform = (payload?.platform || "").toLowerCase();
    if (platform) {
        stats.update(platform, payload?.count, payload?.isLive);
        logStatus(streamHub.status);
    }
};

connection.start(); 