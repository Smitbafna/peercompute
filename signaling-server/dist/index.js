import express from 'express';
const app = express();
const port = 3001;
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});
const server = app.listen(port, () => {
    console.log('Signaling server listening on http://localhost:' + port);
});
const { Server: WSServer } = require('ws');
const wss = new WSServer({ server });
const clients = new Map();
function handleMessage(message, ws) {
    if (typeof message !== 'object' || message === null) {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                code: 'VALIDATION_ERROR',
                message: 'Invalid message format',
                timestamp: Date.now(),
            }));
        }
        return;
    }
    const msgType = message.type;
    const senderId = message.clientId;
    if (msgType === 'COORDINATOR_REGISTER' || msgType === 'WORKER_REGISTER') {
        handleRegistration(message, ws);
        return;
    }
    if (!senderId || !clients.has(senderId)) {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                code: 'NOT_REGISTERED',
                message: 'Sender must register first',
                timestamp: Date.now(),
            }));
        }
        return;
    }
    const sender = clients.get(senderId);
    if (msgType === 'WEBRTC_OFFER' || msgType === 'WEBRTC_ANSWER' || msgType === 'WEBRTC_ICE_CANDIDATE') {
        handleSignalingMessage(message, sender, ws);
        return;
    }
    if (msgType === 'TASK_ASSIGN' || msgType === 'TASK_RESULT' || msgType === 'TASK_PROGRESS') {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                code: 'NOT_IMPLEMENTED',
                message: '' + msgType + ' is not yet implemented in milestone 03',
                timestamp: Date.now(),
            }));
        }
        return;
    }
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
            type: 'ERROR',
            code: 'UNKNOWN_MESSAGE_TYPE',
            message: 'Unknown message type: ' + msgType,
            timestamp: Date.now(),
        }));
    }
}
function handleRegistration(message, ws) {
    if (typeof message !== 'object' || message === null) {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                code: 'INVALID_REGISTRATION',
                message: 'Invalid registration message',
                timestamp: Date.now(),
            }));
        }
        return;
    }
    const { role, clientId } = message;
    if (clients.has(clientId)) {
        const existingClient = clients.get(clientId);
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                code: 'DUPLICATE_ID',
                message: 'Client ID ' + clientId + ' is already registered by another connection',
                timestamp: Date.now(),
            }));
            if (existingClient.ws.readyState === existingClient.ws.OPEN) {
                existingClient.ws.send(JSON.stringify({
                    type: 'ERROR',
                    code: 'DUPLICATE_ID',
                    message: 'Client ID ' + clientId + ' is already registered. New registration rejected.',
                    timestamp: Date.now(),
                }));
            }
        }
        return;
    }
    const allowedRoles = 'coordinator or worker';
    if (role !== 'coordinator' && role !== 'worker') {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                code: 'INVALID_ROLE',
                message: 'Invalid role: ' + role + ' Must be ' + allowedRoles,
                timestamp: Date.now(),
            }));
        }
        return;
    }
    clients.set(clientId, {
        clientId,
        role,
        ws,
        isAlive: true,
    });
    console.log('Client ' + clientId + ' registered as ' + role);
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
            type: 'ERROR',
            code: 'REGISTRATION_SUCCESS',
            message: 'Registration as ' + role + ' successful',
            timestamp: Date.now(),
            clientId,
        }));
    }
}
function handleSignalingMessage(message, sender, ws) {
    const { receiverId } = message;
    if (!receiverId) {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                code: 'MISSING_RECIPIENT',
                message: 'receiverId is required for signaling messages',
                timestamp: Date.now(),
            }));
        }
        return;
    }
    const recipient = clients.get(receiverId);
    if (!recipient) {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                code: 'UNKNOWN_RECIPIENT',
                message: 'No registered client with ID ' + receiverId,
                timestamp: Date.now(),
            }));
        }
        return;
    }
    if (recipient.ws.readyState !== recipient.ws.OPEN) {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                code: 'RECIPIENT_OFFLINE',
                message: 'Recipient ' + receiverId + ' is currently offline',
                timestamp: Date.now(),
            }));
        }
        return;
    }
    try {
        recipient.ws.send(JSON.stringify(message));
        console.log(' signaling message sent from ' + sender.clientId + ' to ' + receiverId);
    }
    catch (error) {
        console.error('Failed to send message to recipient:', error);
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                code: 'SEND_FAILED',
                message: 'Failed to send message to recipient',
                timestamp: Date.now(),
            }));
        }
    }
}
wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });
    ws.on('close', () => {
        for (const [clientId, client] of clients) {
            if (client.ws === ws) {
                console.log('Client ' + clientId + ' disconnected');
                clients.delete(clientId);
                break;
            }
        }
    });
    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
});
wss.on('message', (data, ws) => {
    try {
        const message = JSON.parse(data);
        handleMessage(message, ws);
    }
    catch (error) {
        console.error('Failed to parse message:', error);
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                code: 'PARSE_ERROR',
                message: 'Failed to parse JSON message',
                timestamp: Date.now(),
            }));
        }
    }
});
setInterval(() => {
    wss.clients.forEach((clientWs) => {
        if (clientWs.isAlive === false) {
            return clientWs.terminate();
        }
        clientWs.isAlive = false;
        clientWs.ping?.();
    });
}, 30000);
