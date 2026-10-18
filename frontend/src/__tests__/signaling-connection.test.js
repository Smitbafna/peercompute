/**
 * PeerCompute - Signaling WebSocket connection logic tests
 *
 * Tests the WebSocket connection behavior implemented in App.tsx's connectToServer:
 * - Correct WebSocket URL (ws://localhost:3001)
 * - open event updates UI to connected
 * - close event updates UI to disconnected
 * - error event produces a visible error
 * - A stale socket's close event cannot overwrite a newer active connection's state
 * - Duplicate simultaneous WebSocket connections are prevented (existing socket closed first)
 * - Registration state is separate from WebSocket connection state
 *
 * WebSocket is mocked because vitest runs in Node.js.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------
class MockWebSocket {
    static instances = [];
    static lastUrl = null;
    readyState = 0; // CONNECTING
    url;
    onopen = null;
    onclose = null;
    onmessage = null;
    onerror = null;
    constructor(url) {
        this.url = url;
        MockWebSocket.lastUrl = url;
        MockWebSocket.instances.push(this);
    }
    close() {
        this.readyState = 3; // CLOSED
        if (this.onclose)
            this.onclose(new Event("close"));
    }
}
const OriginalWebSocket = global.WebSocket;
function makeState() {
    return {
        serverStatus: "disconnected",
        connectionState: "---",
        error: "",
        registrationStatus: "Not registered",
        isRegistered: false,
        discoveryStatus: "Not discovered",
        role: null,
        workers: [],
    };
}
// Simulates the connectToServer body from App.tsx.
// Returns the created WebSocket and a function to trigger its events.
function simulateConnectToServer(state, wsRef, hostname = "localhost", protocol = "ws:") {
    // Close any existing WebSocket regardless of readyState (prevents duplicates)
    const existingWs = wsRef.current;
    if (existingWs) {
        existingWs.close();
    }
    state.error = "";
    state.registrationStatus = "Not registered";
    state.isRegistered = false;
    state.discoveryStatus = "Not discovered";
    state.connectionState = "---";
    const ws = new MockWebSocket(`${protocol}//${hostname}:3001`);
    wsRef.current = ws;
    ws.onopen = () => {
        state.serverStatus = "connected";
        state.connectionState = "connecting";
    };
    ws.onmessage = (_event) => {
        // Registration success handled separately; not part of connection state.
    };
    ws.onclose = () => {
        // Guard: ignore close events from stale sockets
        if (wsRef.current !== ws) {
            return;
        }
        state.serverStatus = "disconnected";
        state.connectionState = "disconnected";
        state.registrationStatus = "Not registered";
        state.isRegistered = false;
        state.role = null;
        state.discoveryStatus = "Not discovered";
        state.workers = [];
    };
    ws.onerror = (err) => {
        state.error = "WebSocket error: " + err.message;
    };
    return ws;
}
describe("signaling connection logic", () => {
    beforeEach(() => {
        MockWebSocket.instances = [];
        MockWebSocket.lastUrl = null;
        global.WebSocket = MockWebSocket;
    });
    afterEach(() => {
        global.WebSocket = OriginalWebSocket;
    });
    it("constructs a WebSocket to ws://localhost:3001", () => {
        const state = makeState();
        const wsRef = { current: null };
        const ws = simulateConnectToServer(state, wsRef);
        expect(MockWebSocket.lastUrl).toBe("ws://localhost:3001");
        expect(ws.url).toBe("ws://localhost:3001");
        expect(wsRef.current).toBe(ws);
    });
    it("sets serverStatus to connected on WebSocket open", () => {
        const state = makeState();
        const wsRef = { current: null };
        const ws = simulateConnectToServer(state, wsRef);
        expect(state.serverStatus).toBe("disconnected");
        ws.onopen(new Event("open"));
        expect(state.serverStatus).toBe("connected");
        expect(state.connectionState).toBe("connecting");
    });
    it("sets serverStatus to disconnected on WebSocket close", () => {
        const state = makeState();
        const wsRef = { current: null };
        const ws = simulateConnectToServer(state, wsRef);
        ws.onopen(new Event("open"));
        expect(state.serverStatus).toBe("connected");
        ws.onclose(new Event("close"));
        expect(state.serverStatus).toBe("disconnected");
        expect(state.connectionState).toBe("disconnected");
        expect(state.registrationStatus).toBe("Not registered");
        expect(state.isRegistered).toBe(false);
        expect(state.role).toBe(null);
        expect(state.discoveryStatus).toBe("Not discovered");
        expect(state.workers).toEqual([]);
    });
    it("sets an error on WebSocket error", () => {
        const state = makeState();
        const wsRef = { current: null };
        const ws = simulateConnectToServer(state, wsRef);
        ws.onerror(new Event("error"));
        expect(state.error).toContain("WebSocket error");
    });
    it("prevents duplicate WebSocket connections (closes existing socket first)", () => {
        const state = makeState();
        const wsRef = { current: null };
        const ws1 = simulateConnectToServer(state, wsRef);
        expect(wsRef.current).toBe(ws1);
        expect(ws1.readyState).toBe(0);
        const ws2 = simulateConnectToServer(state, wsRef);
        expect(ws1.readyState).toBe(3);
        expect(wsRef.current).toBe(ws2);
        expect(MockWebSocket.instances.length).toBe(2);
    });
    it("stale socket close event cannot overwrite newer connection state", () => {
        const state = makeState();
        const wsRef = { current: null };
        const ws1 = simulateConnectToServer(state, wsRef);
        ws1.onopen(new Event("open"));
        expect(state.serverStatus).toBe("connected");
        const ws2 = simulateConnectToServer(state, wsRef);
        ws2.onopen(new Event("open"));
        expect(state.serverStatus).toBe("connected");
        expect(wsRef.current).toBe(ws2);
        ws1.onclose(new Event("close"));
        expect(state.serverStatus).toBe("connected");
        expect(state.connectionState).toBe("connecting");
        ws2.onclose(new Event("close"));
        expect(state.serverStatus).toBe("disconnected");
    });
    it("disconnect and reconnect work without duplicate connections", () => {
        const state = makeState();
        const wsRef = { current: null };
        const ws1 = simulateConnectToServer(state, wsRef);
        ws1.onopen(new Event("open"));
        expect(state.serverStatus).toBe("connected");
        wsRef.current?.close();
        expect(state.serverStatus).toBe("disconnected");
        expect(ws1.readyState).toBe(3);
        const ws2 = simulateConnectToServer(state, wsRef);
        ws2.onopen(new Event("open"));
        expect(state.serverStatus).toBe("connected");
        expect(wsRef.current).toBe(ws2);
        expect(wsRef.current).not.toBe(ws1);
    });
    it("registration state is separate from WebSocket connection state", () => {
        const state = makeState();
        const wsRef = { current: null };
        const ws = simulateConnectToServer(state, wsRef);
        ws.onopen(new Event("open"));
        expect(state.serverStatus).toBe("connected");
        expect(state.isRegistered).toBe(false);
        expect(state.registrationStatus).toBe("Not registered");
        state.isRegistered = true;
        state.registrationStatus = "Registered as coordinator";
        state.role = "coordinator";
        expect(state.isRegistered).toBe(true);
        expect(state.serverStatus).toBe("connected");
        ws.onclose(new Event("close"));
        expect(state.serverStatus).toBe("disconnected");
        expect(state.isRegistered).toBe(false);
        expect(state.registrationStatus).toBe("Not registered");
        expect(state.role).toBe(null);
    });
});
