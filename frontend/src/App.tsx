import React, { useState, useRef } from "react";
import {
  WebRTCConnectionManager,
  ConnectionManagerOptions,
  WebrtcOfferMsg,
  WebrtcAnswerMsg,
  processWebrtcOffer,
  processWebrtcAnswer,
  processWebrtcIceCandidate,
} from "./lib/webrtc-connection-manager";

function App() {
  const [role, setRole] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string>("");
  const [serverStatus, setServerStatus] = useState<string>("disconnected");
  const [registrationStatus, setRegistrationStatus] = useState<string>("");
  const [targetClientId, setTargetClientId] = useState<string>("");
  const [connectionState, setConnectionState] = useState<string>("---");
  const [error, setError] = useState<string>("");

  const wsRef = useRef<WebSocket | null>(null);
  const managersRef = useRef<Map<string, WebRTCConnectionManager>>(new Map());

  const connectToServer = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.close();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}:3001`);
    wsRef.current = ws;
    ws.onopen = () => setServerStatus("connected");
    ws.onmessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data);
      handleSignalingMessage(msg);
    };
    ws.onclose = () => {
      setServerStatus("disconnected");
      managersRef.current.forEach((m) => m.close());
      managersRef.current.clear();
    };
    ws.onerror = (err: Event) => setError("WebSocket error: " + (err as any).message);
  };

  const handleSignalingMessage = (msg: any) => {
    const type = msg.type;
    if (type === "REGISTRATION_SUCCESS") {
      setRegistrationStatus("Registered as " + msg.role);
      setRole(msg.role);
    } else if (type === "DUPLICATE_ID") {
      setError("Client ID " + msg.clientId + " is already registered");
    } else if (type === "NOT_REGISTERED") {
      setError("Must register first");
    } else if (type === "ERROR") {
      setError(msg.message || "Signaling error");
    } else if (type === "WEBRTC_OFFER") {
      processWorkerOffer(msg);
    } else if (type === "WEBRTC_ANSWER") {
      processCoordinatorAnswer(msg);
    } else if (type === "WEBRTC_ICE_CANDIDATE") {
      handleIceCandidate(msg);
    }
  };

  const processWorkerOffer = async (msg: any) => {
    const receiverId = msg.senderId;
    let manager = managersRef.current.get(receiverId);
    if (!manager) {
      const options: ConnectionManagerOptions = {
        clientId: msg.clientId,
        role: "worker",
        send: (m: Record<string, unknown>) => wsRef.current?.send(JSON.stringify(m)),
      };
      manager = new WebRTCConnectionManager(options);
      managersRef.current.set(receiverId, manager);
      manager.on("connected", () => setConnectionState("connected to " + receiverId));
      manager.on("disconnected", () => setConnectionState("disconnected"));
    }
    try {
      const offerMsg: WebrtcOfferMsg = {
        type: "WEBRTC_OFFER",
        clientId: msg.clientId,
        senderId: msg.clientId,
        receiverId: receiverId,
        sdp: msg.sdp,
        timestamp: Date.now(),
      };
      await processWebrtcOffer(manager, offerMsg);
      const answer = await manager.createAnswer({ type: "answer" as const, sdp: "" });
      const answerMsg: WebrtcAnswerMsg = {
        type: "WEBRTC_ANSWER",
        clientId: msg.clientId,
        senderId: msg.clientId,
        receiverId: receiverId,
        sdp: answer.sdp ?? "",
        timestamp: Date.now(),
      };
      wsRef.current?.send(JSON.stringify(answerMsg));
    } catch (err) {
      setError("Failed to process offer: " + (err as Error).message);
    }
  };

  const processCoordinatorAnswer = async (msg: any) => {
    const senderId = msg.senderId;
    const manager = managersRef.current.get(senderId);
    if (manager) {
      try {
        const answerMsg: WebrtcAnswerMsg = {
          type: "WEBRTC_ANSWER",
          clientId: msg.clientId,
          senderId: msg.clientId,
          receiverId: senderId,
          sdp: msg.sdp,
          timestamp: Date.now(),
        };
        await processWebrtcAnswer(manager, answerMsg);
        setConnectionState("connected to " + senderId);
      } catch (err) {
        setError("Failed to process answer: " + (err as Error).message);
      }
    }
  };

  const handleIceCandidate = (msg: any) => {
    const senderId = msg.senderId;
    const manager = managersRef.current.get(senderId);
    if (manager) {
      processWebrtcIceCandidate(manager, msg as any);
    }
  };

  const initiateConnection = async () => {
    if (!targetClientId) { setError("Enter target worker client ID"); return; }
    let manager = managersRef.current.get(targetClientId);
    if (!manager) {
      const options: ConnectionManagerOptions = {
        clientId: clientId,
        role: "coordinator",
        send: (m: Record<string, unknown>) => wsRef.current?.send(JSON.stringify(m)),
      };
      manager = new WebRTCConnectionManager(options);
      managersRef.current.set(targetClientId, manager);
      manager.on("connected", () => setConnectionState("connecting to " + targetClientId));
      manager.on("disconnected", () => setConnectionState("disconnected"));
      manager.on("failed", (err: Error) => setError("Connection failed: " + err.message));
    }
    try {
      const offer = await manager.createOffer();
      const offerMsg: any = {
        type: "WEBRTC_OFFER",
        clientId: clientId,
        senderId: clientId,
        receiverId: targetClientId,
        sdp: offer.sdp,
        timestamp: Date.now(),
      };
      wsRef.current?.send(JSON.stringify(offerMsg));
      setConnectionState("connecting to " + targetClientId);
    } catch (err) {
      setError("Failed to create offer: " + (err as Error).message);
    }
  };

  const handleRegister = () => {
    if (!clientId || !role) return;
    const msg = {
      type: role === "coordinator" ? "COORDINATOR_REGISTER" : "WORKER_REGISTER",
      clientId,
      role,
      timestamp: Date.now(),
    };
    wsRef.current?.send(JSON.stringify(msg));
  };

  const coordinatorSection = (
    <div key="coordinator">
      <label>Target Worker Client ID: <input value={targetClientId} onChange={(e) => setTargetClientId((e.target as HTMLInputElement).value)} /> <button onClick={initiateConnection} disabled={!targetClientId}>Connect to Worker</button></label>
      <br />
      <span>Connection state: <strong>{connectionState}</strong></span>
      <br />
      <span>Errors: <strong>{error || "none"}</strong></span>
    </div>
  );

  const workerSection = (
    <div key="worker">
      <p>Waiting for coordinator to initiate connection...</p>
      <button onClick={() => window.location.reload()}>Refresh</button>
    </div>
  );

  const unauthSection = (
    <div key="unauth">
      <button onClick={() => setClientId("123e4567-e89b-400d-8a56-426614174000")}>Use Sample Client ID</button>
      <button onClick={() => connectToServer()}>Connect to Signaling Server</button>
    </div>
  );

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h3>PeerCompute - Milestone 04: WebRTC Connection</h3>
      <div>
        <span>Server: <strong>{serverStatus}</strong></span>
        <br />
        <span>Role: <strong>{role || "not set"}</strong></span>
        <br />
        <span>Client ID: <strong>{clientId || "---"}</strong></span>
      </div>
      <div style={{ margin: "1rem 0", padding: "1rem", background: "#f5f5f5", borderRadius: "4px" }}>
        <strong>Registration:</strong> {registrationStatus}
      </div>
      {role === "coordinator" && coordinatorSection}
      {role === "worker" && workerSection}
      {!role && unauthSection}
    </div>
  );
}

export default App;
