import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import WebSocket from 'ws';
import { WebSocketServer } from 'ws';

describe('Signaling Server - Registration', () => {
  let testServer: http.Server;
  let wss: WebSocketServer;
  let clientsMap: Map<string, any>;

  beforeEach(async () => {
    // Clear clients map
    if (globalThis.clients) {
      (globalThis.clients as Map<string, any>).clear();
    }
    clientsMap = (globalThis.clients as Map<string, any>) || new Map();

    // Create a test HTTP server
    const express = require('express');
    const app = express();
    
    // Import the signaling server functions
    const signaling = await import('../signaling');
    globalThis.clients = signaling.clients;
    (globalThis.clients as Map<string, any>).clear();
    const { handleMessage, handleRegistration, handleSignalingMessage } = signaling;
    
    // Create WebSocket server
    wss = new WebSocketServer({ noServer: true });

    wss.on('connection', (ws: any) => {
      ws.on('message', (data: any) => {
        try {
          const message = JSON.parse(data.toString());
          handleMessage(message, ws);
        } catch (e) {
          // ignore parse errors in tests
        }
      });
    });
    
    // Handle WebSocket upgrade
    app.ws = (_req: any, socket: any, head: any, callback: any) => {
      wss.handleUpgrade(_req, socket, head, (ws: any) => {
        wss.emit('connection', ws, _req);
      });
    };
    
    // Handle regular HTTP requests
    app.get('/health', (_req: any, res: any) => {
      res.status(200).json({ status: 'ok' });
    });
    
    // Create HTTP server
    testServer = http.createServer(app);
    
    // Attach WebSocket server to HTTP server
    testServer.on('upgrade', (_req: any, socket: any, head: any, callback: any) => {
      wss.handleUpgrade(_req, socket, head, (ws: any) => {
        wss.emit('connection', ws, _req);
      });
    });
    
    // Start server on a random port
    await new Promise<void>((resolve) => {
      testServer.listen(0, () => {
        const address = testServer.address();
        if (address && typeof address === 'object' && address.port) {
          resolve();
        }
      });
    });
    
    // Store port for test cases
    (globalThis as any).testPort = (testServer.address() as { port: number }).port;
  });

  afterEach(async () => {
    // Close server
    if (testServer) {
      await new Promise<void>((resolve) => {
        testServer.close(() => resolve());
      });
    }
    // Clear clients
    if (globalThis.clients) {
      (globalThis.clients as Map<string, any>).clear();
    }
    // Close all WebSocket connections
    if (wss) {
      wss.clients.forEach((client: WebSocket) => {
        if (client.readyState === client.OPEN) {
          client.close();
        }
      });
    }
  });

  it('should accept coordinator registration', async () => {
    const port = (globalThis as any).testPort;
    const ws = new WebSocket(`ws://localhost:${port}`);
    
    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'COORDINATOR_REGISTER',
          clientId: 'test-coordinator-1',
          role: 'coordinator',
          timestamp: Date.now(),
        }));
      });
      
      ws.on('message', (data: string) => {
        const msg = JSON.parse(data);
        if (msg.type === 'REGISTRATION_SUCCESS') {
          expect(msg.role).toBe('coordinator');
          expect(msg.clientId).toBe('test-coordinator-1');
          resolve();
        }
      });
    });
    
    ws.close();
  });
  
  it('should reject duplicate client ID registration', async () => {
    const port = (globalThis as any).testPort;
    const ws1 = new WebSocket(`ws://localhost:${port}`);
    const ws2 = new WebSocket(`ws://localhost:${port}`);
    
    // Register first client
    await new Promise<void>((resolve) => {
      const sendRegistration = () => {
        ws1.send(JSON.stringify({
          type: 'WORKER_REGISTER',
          clientId: 'test-worker-1',
          role: 'worker',
          timestamp: Date.now(),
        }));
      };
      if (ws1.readyState === ws1.OPEN) {
        sendRegistration();
      } else {
        ws1.on('open', sendRegistration);
      }

      ws1.on('message', (data: string) => {
        const msg = JSON.parse(data);
        if (msg.type === 'REGISTRATION_SUCCESS') {
          resolve();
        }
      });
    });
    
    // Try to register same client ID on second connection
    await new Promise<void>((resolve) => {
      const sendRegistration = () => {
        ws2.send(JSON.stringify({
          type: 'WORKER_REGISTER',
          clientId: 'test-worker-1',
          role: 'worker',
          timestamp: Date.now(),
        }));
      };
      if (ws2.readyState === ws2.OPEN) {
        sendRegistration();
      } else {
        ws2.on('open', sendRegistration);
      }

      ws2.on('message', (data: string) => {
        const msg = JSON.parse(data);
        if (msg.type === 'ERROR' && msg.code === 'DUPLICATE_ID') {
          resolve();
        }
      });
    });
    
    ws1.close();
    ws2.close();
  });
  
  it('should reject invalid role', async () => {
    const port = (globalThis as any).testPort;
    const ws = new WebSocket(`ws://localhost:${port}`);
    
    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'COORDINATOR_REGISTER',
          clientId: 'test-coordinator-2',
          role: 'invalid-role',
          timestamp: Date.now(),
        }));
      });
      
      ws.on('message', (data: string) => {
        const msg = JSON.parse(data);
        if (msg.type === 'ERROR' && msg.code === 'INVALID_ROLE') {
          resolve();
        }
      });
    });
    
    ws.close();
  });
it("should discover registered workers", async () => {
  const port = (globalThis as any).testPort;

  const connect = () =>
    new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      ws.once("open", () => resolve(ws));
      ws.once("error", reject);
    });

  const waitForMessage = (
    ws: WebSocket,
    predicate: (msg: any) => boolean
  ) =>
    new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timed out waiting for message")),
        3000
      );

      const onMessage = (data: WebSocket.RawData) => {
        let msg: any;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }

        if (msg.type === "ERROR") {
          clearTimeout(timeout);
          ws.off("message", onMessage);
          reject(new Error(`${msg.code}: ${msg.message}`));
          return;
        }

        if (predicate(msg)) {
          clearTimeout(timeout);
          ws.off("message", onMessage);
          resolve(msg);
        }
      };

      ws.on("message", onMessage);
    });

  const worker = await connect();
  const coordinator = await connect();

  try {
    const workerSuccess = waitForMessage(
      worker,
      (msg) => msg.type === "REGISTRATION_SUCCESS"
    );

    worker.send(JSON.stringify({
      type: "WORKER_REGISTER",
      clientId: "discovery-worker-01",
      role: "worker",
      capabilities: ["image-processing"],
      timestamp: Date.now(),
    }));

    await workerSuccess;

    const coordinatorSuccess = waitForMessage(
      coordinator,
      (msg) => msg.type === "REGISTRATION_SUCCESS"
    );

    const initialDiscovery = waitForMessage(
      coordinator,
      (msg) =>
        msg.type === "WORKER_DISCOVERY_RESPONSE" &&
        msg.workers.some(
          (w: any) => w.clientId === "discovery-worker-01"
        )
    );

    coordinator.send(JSON.stringify({
      type: "COORDINATOR_REGISTER",
      clientId: "discovery-coordinator-01",
      role: "coordinator",
      timestamp: Date.now(),
    }));

    await coordinatorSuccess;
    const response = await initialDiscovery;

    expect(response.workers).toContainEqual({
      clientId: "discovery-worker-01",
      role: "worker",
    });
  } finally {
    worker.close();
    coordinator.close();
  }
});
});
