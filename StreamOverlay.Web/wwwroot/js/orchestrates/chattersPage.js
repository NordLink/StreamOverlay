import { ConnectionService } from '../services/connectionService.js';
import { Chatters } from '../components/chatters.js';

async function bootstrap() {

    const chatters = new Chatters('viewerList');

    const connection = new ConnectionService('/chat-hub');

    connection.onInitialViewersCallback = (viewers) => {

        console.log(
            "[ChattersPage] viewersInitial:",
            viewers
        );

        for (const viewer of viewers) {
            chatters.addViewer(viewer);
        }
    };

    connection.onViewerJoinedCallback = (viewer) => {

        console.log(
            "[ChattersPage] viewerJoined:",
            viewer
        );

        chatters.addViewer(viewer);
    };

    connection.onViewerLeftCallback = (viewer) => {

        console.log(
            "[ChattersPage] viewerLeft:",
            viewer
        );

        chatters.removeViewer(viewer.login);
    };

    await connection.start();

    await connection.requestViewers();

    setInterval(() => {
        chatters.updateTimes();
    }, 30000);
}

bootstrap();