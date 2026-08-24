import { ConnectionService } from '../services/connectionService.js';
import { Chatters } from '../components/chatters.js';

async function bootstrap() {

    const chatters = new Chatters('viewerList');

    const connection = new ConnectionService('/chat-hub');

    connection.onInitialChattersCallback = (viewers) => {
        console.log("[ChattersPage] viewersInitial:", viewers);
        for (const viewer of viewers) {
            chatters.addViewer(viewer);
        }
    };

    connection.onChatterJoinedCallback = (viewer) => {
        console.log("[ChattersPage] присоединился чаттер:", viewer);
        chatters.addViewer(viewer);
    };

    connection.onChatterLeftCallback = (viewer) => {
        console.log("[ChattersPage] вышел чаттер:", viewer);
        chatters.removeViewer(viewer);
    };

    await connection.start();

    await connection.requestViewers();

    setInterval(() => {
        chatters.updateTimes();
    }, 30000);
}

bootstrap();