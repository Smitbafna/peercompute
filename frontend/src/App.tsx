import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  MessageType,
  BaseMessageFields,
  isRegistrationSuccessMsg,
  isErrorMsg,
  isWorkerDiscoveryResponseMsg,
  isTestMsg,
  isAckMsg,
} from "peercompute-shared";
import {
  WebRTCConnectionManager,
  ConnectionManagerOptions,
  WebrtcOfferMsg,
  WebrtcAnswerMsg,
  processWebrtcOffer,
  processWebrtcAnswer,
  processWebrtcIceCandidate,
} from "./lib/webrtc-connection-manager";

function generateClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  const hex = (): string => {
    const chars = "0123456789abcdef";
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * 16)]).join("");
  };
  const rand = (): string => {
    const part = hex();
    return (
      part.slice(0, 4) +
      part.slice(4, 6) +
      "4" +
      (part.slice(6, 8).charCodeAt(0) & 0x3f | 0x80).toString(16) +
      (part.slice(8, 10).charCodeAt(0) & 0x3f | 0x80).toString(16) +
      part.slice(10)
    );
  };
  return `${hex()}-${hex()}-${rand()}-${rand()}-${hex()}`;
}

function App(): React.ReactNode {
  const [clientId, setClientId] = useState<string>("");
  const [role, setRole] = useState<"coordinator" | "worker" | null>(null);
  const [serverStatus, setServerStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [registrationStatus, setRegistrationStatus] = useState<string>("Not registered");
  const [discoveryStatus, setDiscoveryStatus] = useState<string>("Not discovered");
  const [workers, setWorkers] = useState<{ clientId: string; role: string }[]>([]);
  const [targetClientId, setTargetClientId] = useState<string>("");
  const [connectionState, setConnectionState] = useState<string>("---");
  const [error, setError] = useState<string>("");
  const [isRegistered, setIsRegistered] = useState(false);
  const [testMessages, setTestMessages] = useState<string[]>([]);
  const [acks, setAcks] = useState<string[]>([]);
  const [sendMessageStatus, setSendMessageStatus] = useState<"pending" | "acknowledged" | "failed">("pending");
  const [dataChannelState, setDataChannelState] = useState<string>("---");
  const [workerClientId, setWorkerClientId] = useState<string>("");
  const [coordinatorClientId, setCoordinatorClientId] = useState<string>("");

  const wsRef = useRef<WebSocket | null>(null);
  const managersRef = useRef<Map<string, WebRTCConnectionManager>>(new Map());
  const messageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      managersRef.current.forEach((m) => m.close());
      managersRef.current.clear();
    };
    // Listen for DataChannel events on each manager
    managersRef.current.forEach((manager, clientId) => {
      manager.on("connect", () => {
        setDataChannelState("open");
        setSendMessageStatus("pending");
      });
      manager.on("close", () => {
        setDataChannelState("closed");
        setSendMessageStatus("pending");
      });
      manager.on("message", ((data: string) => {
        setTestMessages((prev) => [...prev, data]);
        // Try to parse and send ack for test messages
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "TEST") {
            // Send acknowledgement
            manager.send(JSON.stringify({
              type: "ACK",
              messageId: parsed.messageId,
              timestamp: Date.now(),
            }));
            setTestMessages((prev) => [...prev, `Test: ${parsed.payload}`]);
          }
        } catch {}
      }) as (...args: unknown[]) => void);
    });
  }, [managersRef]);

  const connectToServer = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
      return;
    }
    setError("");
    setRegistrationStatus("Not registered");
    setIsRegistered(false);
    setDiscoveryStatus("Not discovered");
    setConnectionState("---");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.hostname}:3001`);
    wsRef.current = ws;

    ws.onopen = () => {
      setServerStatus("connected");
      setConnectionState("connecting");
    };
    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data) as BaseMessageFields;
        handleSignalingMessage(msg);
      } catch (err) {
        setError("Failed to parse server message");
      }
    };
    ws.onclose = () => {
      setServerStatus("disconnected");
      setConnectionState("disconnected");
      managersRef.current.forEach((m) => m.close());
      managersRef.current.clear();
      setRegistrationStatus("Not registered");
      setIsRegistered(false);
      setRole(null);
      setDiscoveryStatus("Not discovered");
      setWorkers([]);
    };
    ws.onerror = (err: Event) =>
    setError("WebSocket error: " + ((err as any).message || "connection failed"));
  }, [isRegistered]);

  const handleSignalingMessage = (msg: BaseMessageFields) => {
    const type = msg.type;

    if (isRegistrationSuccessMsg(msg)) {
      setRegistrationStatus(`Registered as ${msg.role}`);
      setRole(msg.role);
      setIsRegistered(true);
      setWorkers([]);

      // Automatically initiate WebRTC connection after registration
      if (msg.role === "coordinator") {
        // Coordinator initiates connection to a worker
        // We'll use the first discovered worker or a default
        const workerOptions = managersRef.current.get("worker-1");
        if (!workerOptions) {
          // Request worker list first, then initiate
          requestWorkerList();
        } else {
          initiateConnection("worker-1");
        }
      } else {
        // Worker role: connection will be initiated by coordinator
        setConnectionState("waiting for coordinator");
      }
      return;
    }

    if (isErrorMsg(msg)) {
      const code = msg.code;
      if (code === "DUPLICATE_ID") {
        setError(msg.message || "Client ID is already registered");
        setRegistrationStatus("Registration failed");
        return;
      }
      if (code === "INVALID_ROLE") {
        setError(msg.message || "Invalid role selected");
        setRegistrationStatus("Registration failed");
        return;
      }
      if (code === "INVALID_CLIENT_ID") {
        setError(msg.message || "Invalid client ID");
        setRegistrationStatus("Registration failed");
        return;
      }
      if (code === "NOT_REGISTERED") {
        setError(msg.message || "Must register first");
        return;
      }
      setError(msg.message || "Signaling error");
      return;
    }

    if (isWorkerDiscoveryResponseMsg(msg)) {
      setWorkers(msg.workers || []);
      setDiscoveryStatus(`Available workers: ${msg.workers.length}`);

      // Auto-initiate WebRTC connection to first worker after discovery
      if (msg.workers.length > 0 && role === "coordinator") {
        // Connect to first available worker
        initiateConnection(msg.workers[0].clientId);
      }
      return;
    }
  };

  const handleRegister = () => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      setError("Connect to the signaling server first");
      return;
    }
    if (!clientId.trim() || !role) {
      setError("Enter a client ID and select a role");
      return;
    }
    if (isRegistered) {
      setError("Cannot change identity while registered");
      return;
    }

    wsRef.current.send(
      JSON.stringify({
        type: role === "coordinator" ? MessageType.CoordinatorRegister : MessageType.WorkerRegister,
        clientId: clientId.trim(),
        role,
        timestamp: Date.now(),
      })
    );
  };

  const handleSendMessage = () => {
    const input = messageInputRef.current;
    if (!input || !input.value.trim()) return;
    const messageText = input.value.trim();
    
    // Send through the DataChannel
    const manager = managersRef.current.get(role === "coordinator" ? workerClientId : coordinatorClientId);
    if (manager) {
      try {
        setSendMessageStatus("pending");
        manager.send(messageText);
        setSendMessageStatus("acknowledged");
        // Clear input after a moment
        setTimeout(() => {
          setSendMessageStatus("pending");
          input.value = "";
        }, 2000);
      } catch (error) {
        setSendMessageStatus("failed");
        console.error("Send failed:", error);
        setTimeout(() => setSendMessageStatus("pending"), 2000);
      }
    }
  };

  const initiateConnection = useCallback(
    async (receiverId: string) => {
      const options: ConnectionManagerOptions = {
        clientId,
        role: "worker",
        send: (m: Record<string, unknown>) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current?.send(JSON.stringify(m));
          }
        },
        receiverId,
      };
      const newManager = new WebRTCConnectionManager(options);
      managersRef.current.set(receiverId, newManager);
      newManager.on("connect", () => {
        setConnectionState("connected to " + receiverId);
        setDataChannelState("open");
      });
      newManager.on("statechange", () => {
        setConnectionState("disconnected");
        setDataChannelState("---");
      });
      newManager.on("close", () => {
        setConnectionState("closed");
        setDataChannelState("---");
        managersRef.current.delete(receiverId);
      });
      newManager.on("failed", () => {
        setConnectionState("failed");
        setDataChannelState("---");
      });
      try {
        const offer = await newManager.createOffer();
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: MessageType.WebrtcOffer,
              clientId,
              senderId: clientId,
              receiverId,
              sdp: offer.sdp,
              timestamp: Date.now(),
            })
          );
        }
      } catch (err) {
        setError("Failed to create offer: " + (err as Error).message);
      }
    },
    [clientId, isRegistered]
  );

  const handleWorkerOffer = (msg: WebrtcOfferMsg) => {
    const receiverId = msg.senderId;
    const manager = managersRef.current.get(receiverId);
    if (!manager) {
      setError("No recorder manager for " + receiverId);
      return;
    }
    processWebrtcOffer(manager, msg).catch((err) => {
      setError("Failed to set remote description: " + (err as Error).message);
    });
  };

  const handleWorkerAnswer = (msg: WebrtcAnswerMsg) => {
    const receiverId = msg.senderId;
    const manager = managersRef.current.get(receiverId);
    if (!manager) {
      setError("No recorder manager for " + receiverId);
      return;
    }
    processWebrtcAnswer(manager, msg).catch((err) => {
      setError("Failed to set remote description: " + (err as Error).message);
    });
  };

  const handleIceCandidate = (msg: any) => {
    const senderId = msg.senderId;
    const manager = managersRef.current.get(senderId);
    if (!manager) {
      setError("No recorder manager for " + senderId);
      return;
    }
    try {
      processWebrtcIceCandidate(manager, msg as any);
    } catch (err) {
      setError("Failed to add ICE candidate: " + (err as Error).message);
    }
  };

  const requestWorkerList = useCallback(() => {
    if (!isRegistered || role !== "coordinator") {
      setError("Coordinator must be registered to request a worker list");
      return;
    }
    if (!clientId.trim()) {
      setError("Enter a client ID first");
      return;
    }
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      setError("Connect to the signaling server first");
      return;
    }

    wsRef.current.send(
      JSON.stringify({
        type: MessageType.WorkerDiscoveryRequest,
        clientId: clientId.trim(),
        timestamp: Date.now(),
      })
    );
  }, [isRegistered, role, clientId]);

  const coordinatorSection = (
    <div key="coordinator">
      <label>
        Target Worker Client ID:
        <input
          value={targetClientId}
          onChange={(e) => setTargetClientId((e.target as HTMLInputElement).value)}
        />{" "}
        Connect to Worker
      </label>
      <br />
      <span>Connection state: <strong>{connectionState}</strong></span>
      <br />
      <span>Discovery: <strong>{discoveryStatus}</strong></span>
      <br />
      <ul>
        {workers.map((w) => (
          <li key={w.clientId}>{w.clientId}</li>
        ))}
      </ul>
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
      <div>
        <label>Client ID:
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Click Generate ID for a random UUID"
            disabled={isRegistered}
          />
        </label>
        <button
          style={{ marginLeft: "0.5rem" }}
          onClick={() => setClientId(generateClientId())}
          disabled={!!clientId || isRegistered}
        >
          Generate ID
        </button>
      </div>
      <div>
        <label>Role:
          <select
            value={role ?? ""}
            onChange={(e) =>
              setRole(e.target.value === "" ? null : e.target.value as "coordinator" | "worker")
            }
            disabled={isRegistered}
          >
            <option value="">Select role</option>
            <option value="coordinator">Coordinator</option>
            <option value="worker">Worker</option>
          </select>
        </label>
      </div>
      <button onClick={connectToServer} disabled={serverStatus === "connected"}>
        {serverStatus === "connected" ? "Disconnect" : "Connect to Signaling Server"}
      </button>
      <button
        onClick={handleRegister}
        disabled={
          serverStatus !== "connected" || !clientId.trim() || !role || isRegistered
        }
      >
        Register Client
      </button>
      <div style={{ marginTop: "0.5rem" }}>
        <label>
          <input
            type="checkbox"
            checked={isRegistered}
            onChange={() => {
              if (!isRegistered) {
                setClientId("");
                setRole(null);
                setRegistrationStatus("Not registered");
                setIsRegistered(false);
              }
            }}
          />
          <span style={{ marginLeft: "0.3rem" }}>Disable identity change while registered</span>
        </label>
      </div>
      <div style={{ marginTop: "0.5rem" }}>
        <p>
          <strong>Connection:</strong> {serverStatus} | <strong>Registration:</strong> {registrationStatus} | <strong>Discovery:</strong> {discoveryStatus}
        </p>
        <p>
          <strong>Identity:</strong> {isRegistered ? "Registered as " + role : "Not registered"}
        </p>
      </div>
      <div style={{ marginTop: "0.5rem" }}>
        <button
          onClick={() => {
            if (wsRef.current) {
              wsRef.current.close();
            }
          }}
          disabled={wsRef.current?.readyState === WebSocket.CLOSED}
        >
          Disconnect
        </button>
      </div>
      <div>Errors: <strong>{error || "none"}</strong></div>
    </div>
  );

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h3>PeerCompute - Milestone 05: Client Registration & Peer Discovery</h3>
      <div>
        <span>Server: <strong>{serverStatus}</strong></span>
        <br />
        <span>Role: <strong>{role || "not set"}</strong></span>
        <br />
        <span>Client ID: <strong>{clientId || "---"}</strong></span>
      </div>
      <div style={{ margin: "1rem 0", padding: "1rem", background: "#f5f5f5", borderRadius: "4px" }}>
        <strong>Connection:</strong> {serverStatus}
      </div>
      <div style={{ margin: "1rem 0", padding: "1rem", background: "#f5f5f5", borderRadius: "4px" }}>
        <strong>Registration:</strong> {registrationStatus}
      </div>
      <div style={{ margin: "1rem 0", padding: "1rem", background: "#f5f5f5", borderRadius: "4px" }}>
        <strong>Discovery:</strong> {discoveryStatus}
      </div>
      <div style={{ margin: "1rem 0", padding: "1rem", background: "#f5f5f5", borderRadius: "4px" }}>
        <strong>DataChannel:</strong> {dataChannelState}
        <br />
        <strong>Message Status:</strong> {sendMessageStatus}
      </div>
      {/* Messaging UI */}
      <div style={{ marginTop: "1rem", padding: "0.5rem", background: "#e8f4fd", borderRadius: "4px", border: "1px solid #bfd8e0" }}>
        <span>To: <strong>{role === "coordinator" ? "worker" : "coordinator"}</strong></span>
        <input
          type="text"
          ref={messageInputRef}
          placeholder="Type a test message..."
          disabled={dataChannelState !== "open" || !isRegistered || !role}
          style={{ marginRight: "0.5rem", padding: "0.2rem", fontSize: "0.8rem" }}
        />
        <button
          onClick={handleSendMessage}
          disabled={dataChannelState !== "open" || !isRegistered || !role || !messageInputRef.current?.value.trim()}
          style={{ padding: "0.2rem 0.5rem", fontSize: "0.8rem" }}
        >
          Send
        </button>
      </div>
      <div style={{ marginTop: "0.5rem" }}>
        <strong>Sent messages:</strong>
        <ul>
          {testMessages.map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
        </ul>
      </div>
      <div style={{ marginTop: "0.5rem" }}>
        <strong>Received messages:</strong>
        <ul>
          {acks.map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
        </ul>
      </div>
      {role === "coordinator" && coordinatorSection}
      {role === "worker" && workerSection}
      {!isRegistered && unauthSection}
    </div>
  );
}

export default App;
