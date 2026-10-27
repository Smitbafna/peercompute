import { WebSocket } from "ws";
import {
  MessageType,
  WebrtcOfferMsg,
  WebrtcAnswerMsg,
  WebrtcIceCandidateMsg,
} from "peercompute-shared";

export interface RegisteredClient {
  clientId: string;
  role: "coordinator" | "worker";
  ws: WebSocket;
  capabilities: string[];
  isAlive: boolean;
}

export const clients = new Map<string, RegisteredClient>();

const socketClientIds = new WeakMap<WebSocket, string>();

function send(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function sendError(ws: WebSocket, code: string, message: string): void {
  send(ws, {
    type: MessageType.Error,
    code,
    message,
    timestamp: Date.now(),
  });
}

function isValidClientId(clientId: unknown): clientId is string {
  return typeof clientId === "string" && clientId.trim().length > 0;
}

function getConnectedWorkers(): { clientId: string; role: "worker" }[] {
  const result: { clientId: string; role: "worker" }[] = [];
  for (const client of clients.values()) {
    if (client.role === "worker" && client.ws.readyState === client.ws.OPEN) {
      result.push({ clientId: client.clientId, role: "worker" });
    }
  }
  return result;
}

function notifyCoordinators(): void {
  const workers = getConnectedWorkers();
  for (const coordinator of clients.values()) {
    if (
      coordinator.role === "coordinator" &&
      coordinator.ws.readyState === coordinator.ws.OPEN
    ) {
      const filtered = workers.filter(
        (w) => w.clientId !== coordinator.clientId
      );
      send(coordinator.ws, {
        type: MessageType.WorkerDiscoveryResponse,
        workers: filtered,
        timestamp: Date.now(),
      });
    }
  }
}

export function handleRegistration(message: any, ws: WebSocket): void {
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    sendError(ws, "INVALID_REGISTRATION", "Invalid registration message");
    return;
  }

  const type = message.type;
  const rawClientId = message.clientId;
  const rawRole = message.role;

  if (!isValidClientId(rawClientId)) {
    sendError(ws, "INVALID_CLIENT_ID", "A non-empty client ID is required");
    return;
  }
  const clientId = rawClientId.trim();

  let role: "coordinator" | "worker" | null = null;
  if (rawRole === "coordinator" || rawRole === "worker") {
    role = rawRole;
  } else if (rawRole === undefined || rawRole === null) {
    if (type === MessageType.CoordinatorRegister) {
      role = "coordinator";
    } else if (type === MessageType.WorkerRegister) {
      role = "worker";
    }
  }

  if (type === MessageType.CoordinatorRegister && role !== "coordinator") {
    sendError(ws, "INVALID_ROLE", "Invalid role for coordinator registration");
    return;
  }
  if (type === MessageType.WorkerRegister && role !== "worker") {
    sendError(ws, "INVALID_ROLE", "Invalid role for worker registration");
    return;
  }
  if (role !== "coordinator" && role !== "worker") {
    sendError(
      ws,
      "INVALID_ROLE",
      "Invalid role: " + rawRole + ". Must be coordinator or worker"
    );
    return;
  }

  if (socketClientIds.has(ws)) {
    sendError(ws, "ALREADY_REGISTERED", "This connection is already registered");
    return;
  }

  const existing = clients.get(clientId);
  if (existing) {
    sendError(ws, "DUPLICATE_ID", "Client ID " + clientId + " is already registered");
    return;
  }

  let capabilities: string[] = [];
  if (message.capabilities !== undefined) {
    if (
      !Array.isArray(message.capabilities) ||
      message.capabilities.some((c: unknown) => typeof c !== "string")
    ) {
      sendError(ws, "INVALID_CAPABILITIES", "Capabilities must be an array of strings");
      return;
    }
    capabilities = message.capabilities as string[];
  }

  clients.set(clientId, {
    clientId,
    role,
    ws,
    capabilities,
    isAlive: true,
  });
  socketClientIds.set(ws, clientId);

  console.log("Client " + clientId + " registered as " + role);

  send(ws, {
    type: MessageType.RegistrationSuccess,
    clientId,
    role,
    timestamp: Date.now(),
  });

  if (role === "worker") {
    notifyCoordinators();
  } else {
    const workers = getConnectedWorkers().filter((w) => w.clientId !== clientId);
    send(ws, {
      type: MessageType.WorkerDiscoveryResponse,
      workers,
      timestamp: Date.now(),
    });
  }
}

export function handleDiscoveryRequest(
  message: any,
  ws: WebSocket,
  client: RegisteredClient
): void {
  if (client.role !== "coordinator") {
    sendError(ws, "FORBIDDEN", "Only coordinators can discover workers");
    return;
  }

  if (
    typeof message?.clientId === "string" &&
    message.clientId.trim() !== "" &&
    message.clientId.trim() !== client.clientId
  ) {
    sendError(ws, "FORBIDDEN", "Cannot discover workers as another client");
    return;
  }

  const workers = getConnectedWorkers().filter(
    (w) => w.clientId !== client.clientId
  );
  send(ws, {
    type: MessageType.WorkerDiscoveryResponse,
    workers,
    timestamp: Date.now(),
  });
}

export function handleSignalingMessage(
  message: WebrtcOfferMsg | WebrtcAnswerMsg | WebrtcIceCandidateMsg,
  sender: RegisteredClient,
  ws: WebSocket,
): void {
  const { receiverId, type } = message;

  if (!receiverId || typeof receiverId !== "string" || receiverId.trim() === "") {
    sendError(ws, "MISSING_RECIPIENT", "receiverId is required for signaling messages");
    return;
  }
  if (type !== MessageType.WebrtcOffer && type !== MessageType.WebrtcAnswer && type !== MessageType.WebrtcIceCandidate) {
    sendError(ws, "INVALID_MESSAGE_TYPE", "Unsupported WebRTC message type");
    return;
  }
  if (!message.senderId || typeof message.senderId !== "string" || message.senderId.trim() === "") {
    sendError(ws, "INVALID_SENDER", "senderId is required");
    return;
  }
  if (message.senderId !== sender.clientId) {
    sendError(ws, "FORBIDDEN", "Signaling sender identity mismatch");
    return;
  }
  if (!receiverId || typeof receiverId !== "string" || receiverId.trim() === "") {
    sendError(ws, "INVALID_RECIPIENT", "receiverId must be a non-empty string");
    return;
  }
  const recipient = clients.get(receiverId);
  if (!recipient) {
    sendError(ws, "UNKNOWN_RECIPIENT", "No registered client with ID " + receiverId);
    return;
  }
  if (recipient.ws.readyState !== recipient.ws.OPEN) {
    sendError(ws, "RECIPIENT_OFFLINE", "Recipient " + receiverId + " is currently offline");
    return;
  }

  try {
    recipient.ws.send(JSON.stringify(message));
    console.log(
      "WebRTC signaling message sent from " +
        sender.clientId +
        " to " +
        receiverId +
        " [" +
        message.type +
        "]"
    );
  } catch (error) {
    console.error("Failed to send WebRTC signaling message to recipient:", error);
    sendError(ws, "SEND_FAILED", "Failed to send WebRTC signaling message to recipient");
  }
}

export function handleDisconnect(ws: WebSocket): void {
  const clientId = socketClientIds.get(ws);
  let removedWorker = false;
  if (clientId) {
    const client = clients.get(clientId);
    if (client && client.ws === ws) {
      clients.delete(clientId);
      removedWorker = client.role === "worker";
      console.log("Client " + clientId + " disconnected");
    }
    socketClientIds.delete(ws);
  }

  for (const [id, client] of [...clients.entries()]) {
    if (client.ws === ws) {
      clients.delete(id);
      if (client.role === "worker") removedWorker = true;
      console.log("Client " + id + " disconnected");
    }
  }

  if (removedWorker) {
    notifyCoordinators();
  }
}

export function handleMessage(message: any, ws: WebSocket): void {
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    sendError(ws, "VALIDATION_ERROR", "Invalid message format");
    return;
  }

  const msgType = message.type;
  if (typeof msgType !== "string" || msgType.trim() === "") {
    sendError(ws, "VALIDATION_ERROR", "Missing or invalid message type");
    return;
  }

  if (
    msgType === MessageType.CoordinatorRegister ||
    msgType === MessageType.WorkerRegister
  ) {
    handleRegistration(message, ws);
    return;
  }

  const registeredId = socketClientIds.get(ws);
  const client = registeredId ? clients.get(registeredId) : undefined;
  if (!client || client.ws !== ws) {
    sendError(ws, "NOT_REGISTERED", "Sender must register first");
    return;
  }

  if (
    typeof message.clientId === "string" &&
    message.clientId.trim() !== "" &&
    message.clientId.trim() !== client.clientId
  ) {
    sendError(ws, "FORBIDDEN", "Cannot act as another client");
    return;
  }

  if (msgType === MessageType.WorkerDiscoveryRequest) {
    handleDiscoveryRequest(message, ws, client);
    return;
  }

  if (
    msgType === MessageType.WebrtcOffer ||
    msgType === MessageType.WebrtcAnswer ||
    msgType === MessageType.WebrtcIceCandidate
  ) {
    const webrtcMsg = msgType === MessageType.WebrtcOffer
      ? (message as WebrtcOfferMsg)
      : msgType === MessageType.WebrtcAnswer
        ? (message as WebrtcAnswerMsg)
        : (message as WebrtcIceCandidateMsg);
    handleSignalingMessage(webrtcMsg, client, ws);
    return;
  }

  sendError(ws, "UNKNOWN_MESSAGE_TYPE", "Unknown message type: " + msgType);
}
