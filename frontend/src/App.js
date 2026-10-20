import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useCallback, useEffect } from "react";
import { MessageType, isRegistrationSuccessMsg, isErrorMsg, isWorkerDiscoveryResponseMsg, } from "peercompute-shared";
import { WebRTCConnectionManager, processWebrtcOffer, processWebrtcAnswer, processWebrtcIceCandidate, } from "./lib/webrtc-connection-manager";
function generateClientId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    const hex = () => {
        const chars = "0123456789abcdef";
        return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * 16)]).join("");
    };
    const rand = () => {
        const part = hex();
        return (part.slice(0, 4) +
            part.slice(4, 6) +
            "4" +
            (part.slice(6, 8).charCodeAt(0) & 0x3f | 0x80).toString(16) +
            (part.slice(8, 10).charCodeAt(0) & 0x3f | 0x80).toString(16) +
            part.slice(10));
    };
    return `${hex()}-${hex()}-${rand()}-${rand()}-${hex()}`;
}
function App() {
    const [clientId, setClientId] = useState("");
    const [role, setRole] = useState(null);
    const [serverStatus, setServerStatus] = useState("disconnected");
    const [registrationStatus, setRegistrationStatus] = useState("Not registered");
    const [discoveryStatus, setDiscoveryStatus] = useState("Not discovered");
    const [workers, setWorkers] = useState([]);
    const [targetClientId, setTargetClientId] = useState("");
    const [connectionState, setConnectionState] = useState("---");
    const [error, setError] = useState("");
    const [isRegistered, setIsRegistered] = useState(false);
    const [testMessages, setTestMessages] = useState([]);
    const [acks, setAcks] = useState([]);
    const [sendMessageStatus, setSendMessageStatus] = useState("pending");
    const [dataChannelState, setDataChannelState] = useState("---");
    const [workerClientId, setWorkerClientId] = useState("");
    const [coordinatorClientId, setCoordinatorClientId] = useState("");
    const wsRef = useRef(null);
    const managersRef = useRef(new Map());
    const messageInputRef = useRef(null);
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
            manager.on("message", ((data) => {
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
                }
                catch { }
            }));
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
        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                handleSignalingMessage(msg);
            }
            catch (err) {
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
        ws.onerror = (err) => setError("WebSocket error: " + (err.message || "connection failed"));
    }, [isRegistered]);
    const handleSignalingMessage = (msg) => {
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
                }
                else {
                    initiateConnection("worker-1");
                }
            }
            else {
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
        wsRef.current.send(JSON.stringify({
            type: role === "coordinator" ? MessageType.CoordinatorRegister : MessageType.WorkerRegister,
            clientId: clientId.trim(),
            role,
            timestamp: Date.now(),
        }));
    };
    const handleSendMessage = () => {
        const input = messageInputRef.current;
        if (!input || !input.value.trim())
            return;
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
            }
            catch (error) {
                setSendMessageStatus("failed");
                console.error("Send failed:", error);
                setTimeout(() => setSendMessageStatus("pending"), 2000);
            }
        }
    };
    const initiateConnection = useCallback(async (receiverId) => {
        const options = {
            clientId,
            role: "worker",
            send: (m) => {
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
                wsRef.current.send(JSON.stringify({
                    type: MessageType.WebrtcOffer,
                    clientId,
                    senderId: clientId,
                    receiverId,
                    sdp: offer.sdp,
                    timestamp: Date.now(),
                }));
            }
        }
        catch (err) {
            setError("Failed to create offer: " + err.message);
        }
    }, [clientId, isRegistered]);
    const handleWorkerOffer = (msg) => {
        const receiverId = msg.senderId;
        const manager = managersRef.current.get(receiverId);
        if (!manager) {
            setError("No recorder manager for " + receiverId);
            return;
        }
        processWebrtcOffer(manager, msg).catch((err) => {
            setError("Failed to set remote description: " + err.message);
        });
    };
    const handleWorkerAnswer = (msg) => {
        const receiverId = msg.senderId;
        const manager = managersRef.current.get(receiverId);
        if (!manager) {
            setError("No recorder manager for " + receiverId);
            return;
        }
        processWebrtcAnswer(manager, msg).catch((err) => {
            setError("Failed to set remote description: " + err.message);
        });
    };
    const handleIceCandidate = (msg) => {
        const senderId = msg.senderId;
        const manager = managersRef.current.get(senderId);
        if (!manager) {
            setError("No recorder manager for " + senderId);
            return;
        }
        try {
            processWebrtcIceCandidate(manager, msg);
        }
        catch (err) {
            setError("Failed to add ICE candidate: " + err.message);
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
        wsRef.current.send(JSON.stringify({
            type: MessageType.WorkerDiscoveryRequest,
            clientId: clientId.trim(),
            timestamp: Date.now(),
        }));
    }, [isRegistered, role, clientId]);
    const coordinatorSection = (_jsxs("div", { children: [_jsxs("label", { children: ["Target Worker Client ID:", _jsx("input", { value: targetClientId, onChange: (e) => setTargetClientId(e.target.value) }), " ", "Connect to Worker"] }), _jsx("br", {}), _jsxs("span", { children: ["Connection state: ", _jsx("strong", { children: connectionState })] }), _jsx("br", {}), _jsxs("span", { children: ["Discovery: ", _jsx("strong", { children: discoveryStatus })] }), _jsx("br", {}), _jsx("ul", { children: workers.map((w) => (_jsx("li", { children: w.clientId }, w.clientId))) }), _jsx("br", {}), _jsxs("span", { children: ["Errors: ", _jsx("strong", { children: error || "none" })] })] }, "coordinator"));
    const workerSection = (_jsxs("div", { children: [_jsx("p", { children: "Waiting for coordinator to initiate connection..." }), _jsx("button", { onClick: () => window.location.reload(), children: "Refresh" })] }, "worker"));
    const unauthSection = (_jsxs("div", { children: [_jsxs("div", { children: [_jsxs("label", { children: ["Client ID:", _jsx("input", { value: clientId, onChange: (e) => setClientId(e.target.value), placeholder: "Click Generate ID for a random UUID", disabled: isRegistered })] }), _jsx("button", { style: { marginLeft: "0.5rem" }, onClick: () => setClientId(generateClientId()), disabled: !!clientId || isRegistered, children: "Generate ID" })] }), _jsx("div", { children: _jsxs("label", { children: ["Role:", _jsxs("select", { value: role ?? "", onChange: (e) => setRole(e.target.value === "" ? null : e.target.value), disabled: isRegistered, children: [_jsx("option", { value: "", children: "Select role" }), _jsx("option", { value: "coordinator", children: "Coordinator" }), _jsx("option", { value: "worker", children: "Worker" })] })] }) }), _jsx("button", { onClick: connectToServer, disabled: serverStatus === "connected", children: serverStatus === "connected" ? "Disconnect" : "Connect to Signaling Server" }), _jsx("button", { onClick: handleRegister, disabled: serverStatus !== "connected" || !clientId.trim() || !role || isRegistered, children: "Register Client" }), _jsx("div", { style: { marginTop: "0.5rem" }, children: _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: isRegistered, onChange: () => {
                                if (!isRegistered) {
                                    setClientId("");
                                    setRole(null);
                                    setRegistrationStatus("Not registered");
                                    setIsRegistered(false);
                                }
                            } }), _jsx("span", { style: { marginLeft: "0.3rem" }, children: "Disable identity change while registered" })] }) }), _jsxs("div", { style: { marginTop: "0.5rem" }, children: [_jsxs("p", { children: [_jsx("strong", { children: "Connection:" }), " ", serverStatus, " | ", _jsx("strong", { children: "Registration:" }), " ", registrationStatus, " | ", _jsx("strong", { children: "Discovery:" }), " ", discoveryStatus] }), _jsxs("p", { children: [_jsx("strong", { children: "Identity:" }), " ", isRegistered ? "Registered as " + role : "Not registered"] })] }), _jsx("div", { style: { marginTop: "0.5rem" }, children: _jsx("button", { onClick: () => {
                        if (wsRef.current) {
                            wsRef.current.close();
                        }
                    }, disabled: wsRef.current?.readyState === WebSocket.CLOSED, children: "Disconnect" }) }), _jsxs("div", { children: ["Errors: ", _jsx("strong", { children: error || "none" })] })] }, "unauth"));
    return (_jsxs("div", { style: { padding: "2rem", fontFamily: "sans-serif" }, children: [_jsx("h3", { children: "PeerCompute - Milestone 05: Client Registration & Peer Discovery" }), _jsxs("div", { children: [_jsxs("span", { children: ["Server: ", _jsx("strong", { children: serverStatus })] }), _jsx("br", {}), _jsxs("span", { children: ["Role: ", _jsx("strong", { children: role || "not set" })] }), _jsx("br", {}), _jsxs("span", { children: ["Client ID: ", _jsx("strong", { children: clientId || "---" })] })] }), _jsxs("div", { style: { margin: "1rem 0", padding: "1rem", background: "#f5f5f5", borderRadius: "4px" }, children: [_jsx("strong", { children: "Connection:" }), " ", serverStatus] }), _jsxs("div", { style: { margin: "1rem 0", padding: "1rem", background: "#f5f5f5", borderRadius: "4px" }, children: [_jsx("strong", { children: "Registration:" }), " ", registrationStatus] }), _jsxs("div", { style: { margin: "1rem 0", padding: "1rem", background: "#f5f5f5", borderRadius: "4px" }, children: [_jsx("strong", { children: "Discovery:" }), " ", discoveryStatus] }), _jsxs("div", { style: { margin: "1rem 0", padding: "1rem", background: "#f5f5f5", borderRadius: "4px" }, children: [_jsx("strong", { children: "DataChannel:" }), " ", dataChannelState, _jsx("br", {}), _jsx("strong", { children: "Message Status:" }), " ", sendMessageStatus] }), _jsxs("div", { style: { marginTop: "1rem", padding: "0.5rem", background: "#e8f4fd", borderRadius: "4px", border: "1px solid #bfd8e0" }, children: [_jsxs("span", { children: ["To: ", _jsx("strong", { children: role === "coordinator" ? "worker" : "coordinator" })] }), _jsx("input", { type: "text", ref: messageInputRef, placeholder: "Type a test message...", disabled: dataChannelState !== "open" || !isRegistered || !role, style: { marginRight: "0.5rem", padding: "0.2rem", fontSize: "0.8rem" } }), _jsx("button", { onClick: handleSendMessage, disabled: dataChannelState !== "open" || !isRegistered || !role || !messageInputRef.current?.value.trim(), style: { padding: "0.2rem 0.5rem", fontSize: "0.8rem" }, children: "Send" })] }), _jsxs("div", { style: { marginTop: "0.5rem" }, children: [_jsx("strong", { children: "Sent messages:" }), _jsx("ul", { children: testMessages.map((msg, i) => (_jsx("li", { children: msg }, i))) })] }), _jsxs("div", { style: { marginTop: "0.5rem" }, children: [_jsx("strong", { children: "Received messages:" }), _jsx("ul", { children: acks.map((msg, i) => (_jsx("li", { children: msg }, i))) })] }), role === "coordinator" && coordinatorSection, role === "worker" && workerSection, !isRegistered && unauthSection] }));
}
export default App;
