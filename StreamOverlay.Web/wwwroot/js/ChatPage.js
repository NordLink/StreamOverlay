import { ConnectionService } from './services/ConnectionService.js';
import { Chat } from './components/Chat.js';
import { ViewerStats } from './components/ViewerStats.js';

const chat = new Chat("chat", {
    maxLines: 12,
    platformDisplay: 'border', // Варианты: 'tag' или 'border'
    showTime: true
});

const connection = new ConnectionService("/chat-hub");

connection.onChatMessageCallback = (payload) => {
    chat.appendMessage(payload);
};

connection.start(); 