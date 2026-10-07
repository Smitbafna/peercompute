import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef } from "react";
import { WebRTCConnectionManager, processWebrtcOffer, processWebrtcAnswer, processWebrtcIceCandidate, } from "./lib/webrtc-connection-manager";
function App() {
    const [role, setRole] = useState(null);
    const [clientId, setClientId] = useState("");
    const [serverStatus, setServerStatus] = useState("disconnected");
    const [registrationStatus, setRegistrationStatus] = useState("");
    const [targetClientId, setTargetClientId] = useState("");
    const [connectionState, setConnectionState] = useState("---");
    const [error, setError] = useState("");
    const wsRef = useRef(null);
    const managersRef = useRef(new Map());
    const connectToServer = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN)
            wsRef.current.close();
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(`${protocol}//${window.location.host}:3001`);
        wsRef.current = ws;
        ws.onopen = () => setServerStatus("connected");
        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            handleSignalingMessage(msg);
        };
        ws.onclose = () => {
            setServerStatus("disconnected");
            managersRef.current.forEach((m) => m.close());
            managersRef.current.clear();
        };
        ws.onerror = (err) => setError("WebSocket error: " + err.message);
    };
    const handleSignalingMessage = (msg) => {
        const type = msg.type;
        if (type === "REGISTRATION_SUCCESS") {
            setRegistrationStatus("Registered as " + msg.role);
            setRole(msg.role);
        }
        else if (type === "DUPLICATE_ID") {
            setError("Client ID " + msg.clientId + " is already registered");
        }
        else if (type === "NOT_REGISTERED") {
            setError("Must register first");
        }
        else if (type === "ERROR") {
            setError(msg.message || "Signaling error");
        }
        else if (type === "WEBRTC_OFFER") {
            processWorkerOffer(msg);
        }
        else if (type === "WEBRTC_ANSWER") {
            processCoordinatorAnswer(msg);
        }
        else if (type === "WEBRTC_ICE_CANDIDATE") {
            handleIceCandidate(msg);
        }
    };
    const processWorkerOffer = async (msg) => {
        const receiverId = msg.senderId;
        let manager = managersRef.current.get(receiverId);
        if (!manager) {
            const options = {
                clientId: msg.clientId,
                role: "worker",
                send: (m) => wsRef.current?.send(JSON.stringify(m)),
            };
            manager = new WebRTCConnectionManager(options);
            managersRef.current.set(receiverId, manager);
            manager.on("connected", () => setConnectionState("connected to " + receiverId));
            manager.on("disconnected", () => setConnectionState("disconnected"));
        }
        try {
            const offerMsg = {
                type: "WEBRTC_OFFER",
                clientId: msg.clientId,
                senderId: msg.clientId,
                receiverId: receiverId,
                sdp: msg.sdp,
                timestamp: Date.now(),
            };
            await processWebrtcOffer(manager, offerMsg);
            const answer = await manager.createAnswer({ type: "answer", sdp: "" });
            const answerMsg = {
                type: "WEBRTC_ANSWER",
                clientId: msg.clientId,
                senderId: msg.clientId,
                receiverId: receiverId,
                sdp: answer.sdp ?? "",
                timestamp: Date.now(),
            };
            wsRef.current?.send(JSON.stringify(answerMsg));
        }
        catch (err) {
            setError("Failed to process offer: " + err.message);
        }
    };
    const processCoordinatorAnswer = async (msg) => {
        const senderId = msg.senderId;
        const manager = managersRef.current.get(senderId);
        if (manager) {
            try {
                const answerMsg = {
                    type: "WEBRTC_ANSWER",
                    clientId: msg.clientId,
                    senderId: msg.clientId,
                    receiverId: senderId,
                    sdp: msg.sdp,
                    timestamp: Date.now(),
                };
                await processWebrtcAnswer(manager, answerMsg);
                setConnectionState("connected to " + senderId);
            }
            catch (err) {
                setError("Failed to process answer: " + err.message);
            }
        }
    };
    const handleIceCandidate = (msg) => {
        const senderId = msg.senderId;
        const manager = managersRef.current.get(senderId);
        if (manager) {
            processWebrtcIceCandidate(manager, msg);
        }
    };
    const initiateConnection = async () => {
        if (!targetClientId) {
            setError("Enter target worker client ID");
            return;
        }
        let manager = managersRef.current.get(targetClientId);
        if (!manager) {
            const options = {
                clientId: clientId,
                role: "coordinator",
                send: (m) => wsRef.current?.send(JSON.stringify(m)),
            };
            manager = new WebRTCConnectionManager(options);
            managersRef.current.set(targetClientId, manager);
            manager.on("connected", () => setConnectionState("connecting to " + targetClientId));
            manager.on("disconnected", () => setConnectionState("disconnected"));
            manager.on("failed", (err) => setError("Connection failed: " + err.message));
        }
        try {
            const offer = await manager.createOffer();
            const offerMsg = {
                type: "WEBRTC_OFFER",
                clientId: clientId,
                senderId: clientId,
                receiverId: targetClientId,
                sdp: offer.sdp,
                timestamp: Date.now(),
            };
            wsRef.current?.send(JSON.stringify(offerMsg));
            setConnectionState("connecting to " + targetClientId);
        }
        catch (err) {
            setError("Failed to create offer: " + err.message);
        }
    };
    const handleRegister = () => {
        if (!clientId || !role)
            return;
        const msg = {
            type: role === "coordinator" ? "COORDINATOR_REGISTER" : "WORKER_REGISTER",
            clientId,
            role,
            timestamp: Date.now(),
        };
        wsRef.current?.send(JSON.stringify(msg));
    };
    const coordinatorSection = (_jsxs("div", { children: [_jsxs("label", { children: ["Target Worker Client ID: ", _jsx("input", { value: targetClientId, onChange: (e) => setTargetClientId(e.target.value) }), " ", _jsx("button", { onClick: initiateConnection, disabled: !targetClientId, children: "Connect to Worker" })] }), _jsx("br", {}), _jsxs("span", { children: ["Connection state: ", _jsx("strong", { children: connectionState })] }), _jsx("br", {}), _jsxs("span", { children: ["Errors: ", _jsx("strong", { children: error || "none" })] })] }, "coordinator"));
    const workerSection = (_jsxs("div", { children: [_jsx("p", { children: "Waiting for coordinator to initiate connection..." }), _jsx("button", { onClick: () => window.location.reload(), children: "Refresh" })] }, "worker"));
    const unauthSection = (_jsxs("div", { children: [_jsx("button", { onClick: () => setClientId("123e4567-e89b-400d-8a56-426614174000"), children: "Use Sample Client ID" }), _jsx("button", { onClick: () => connectToServer(), children: "Connect to Signaling Server" })] }, "unauth"));
    return (_jsxs("div", { style: { padding: "2rem", fontFamily: "sans-serif" }, children: [_jsx("h3", { children: "PeerCompute - Milestone 04: WebRTC Connection" }), _jsxs("div", { children: [_jsxs("span", { children: ["Server: ", _jsx("strong", { children: serverStatus })] }), _jsx("br", {}), _jsxs("span", { children: ["Role: ", _jsx("strong", { children: role || "not set" })] }), _jsx("br", {}), _jsxs("span", { children: ["Client ID: ", _jsx("strong", { children: clientId || "---" })] })] }), _jsxs("div", { style: { margin: "1rem 0", padding: "1rem", background: "#f5f5f5", borderRadius: "4px" }, children: [_jsx("strong", { children: "Registration:" }), " ", registrationStatus] }), role === "coordinator" && coordinatorSection, role === "worker" && workerSection, !role && unauthSection] }));
}
export default App;
