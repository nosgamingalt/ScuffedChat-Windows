// WebSocket.js - Handles real-time WebSocket connection

class WebSocketClient {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.listeners = {};
        this.connected = false;
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.connected = true;
                this.reconnectAttempts = 0;
                this.emit('connected');
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.connected = false;
                this.emit('disconnected');
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.emit('error', error);
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', error);
                }
            };
        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            this.attemptReconnect();
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnect attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            this.connect();
        }, delay);
    }

    handleMessage(message) {
        const { type, payload } = message;

        switch (type) {
            case 'message':
                this.emit('message', payload);
                break;
            case 'typing':
                this.emit('typing', payload);
                break;
            case 'read':
                this.emit('read', payload);
                break;
            case 'online_status':
                this.emit('online_status', payload);
                break;
            case 'friend_request':
                this.emit('friend_request', payload);
                break;
            default:
                console.log('Unknown message type:', type);
        }
    }

    send(type, payload) {
        if (!this.connected || !this.ws) {
            console.warn('WebSocket not connected');
            return;
        }

        try {
            this.ws.send(JSON.stringify({ type, payload }));
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    }

    sendTyping(recipientId, isTyping) {
        this.send('typing', {
            recipient_id: recipientId,
            typing: isTyping
        });
    }

    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    emit(event, data) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(callback => callback(data));
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

// Create global WebSocket instance
window.wsClient = new WebSocketClient();
