import { ConfigService } from '../services/configService.js';
import { ConnectionService } from '../services/connectionService.js';
import { Chat } from '../components/chat.js';

async function bootstrap() {
    const configService = new ConfigService();
    const config = await configService.getConfigSafe();

    const chat = new Chat('chat', config.chat);

    const connection = new ConnectionService('/chat-hub');
    connection.onChatMessageCallback = (payload) => chat.appendMessage(payload);
    await connection.start();
}
bootstrap();