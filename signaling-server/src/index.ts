import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import {
  clients,
  handleMessage,
  handleRegistration,
  handleSignalingMessage,
  handleDisconnect,
} from "./signaling";

declare module "ws" {
  interface WebSocket {
    isAlive: boolean;
  }
}

export { clients, handleMessage, handleRegistration, handleSignalingMessage, handleDisconnect };

export const app = express();
const port = 3001;

app.get("/health", (req: express.Request, res: express.Response) => {
  res.status(200).json({ status: "ok" });
});

export const server = app.listen(port, () => {
  console.log("Signaling server listening on http://localhost:" + port);
});

(globalThis as any).clients = clients;

const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
  ws.on("close", () => {
    handleDisconnect(ws);
  });
  ws.on("error", (err: any) => {
    console.error("WebSocket error:", err);
  });
  ws.on("message", (data: any) => {
    try {
      const message = JSON.parse(data.toString());
      handleMessage(message, ws);
    } catch (error) {
      console.error("Failed to parse message:", error);
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({
            type: "ERROR",
            code: "PARSE_ERROR",
            message: "Failed to parse JSON message",
            timestamp: Date.now(),
          })
        );
      }
    }
  });
});

setInterval(() => {
  wss.clients.forEach((clientWs: WebSocket) => {
    if (clientWs.isAlive === false) {
      return clientWs.terminate();
    }
    clientWs.isAlive = false;
    clientWs.ping?.();
  });
}, 30000);

export { server as signalingServer };
export default app;
