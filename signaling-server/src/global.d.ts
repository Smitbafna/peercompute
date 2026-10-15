import http = require('http');
import { WebSocketServer } from 'ws';

declare global {
  var testPort: number;
  var testServer: http.Server;
  var wss: WebSocketServer;
  var clients: Map<string, any>;
}

export {};
