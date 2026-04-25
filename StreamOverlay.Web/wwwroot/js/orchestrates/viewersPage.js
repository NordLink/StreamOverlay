import { ConnectionService } from '../services/connectionService.js';
import { ViewerStats } from '../components/viewerStats.js';

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