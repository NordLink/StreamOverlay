import { ConnectionService } from './services/ConnectionService.js';
import { Chat } from './components/Chat.js';

const chat = new Chat("chat", 50);
const connection = new ConnectionService("/chat-hub");

connection.onChatMessageCallback = (payload) => {
    chat.appendMessage(payload);
};

connection.start();