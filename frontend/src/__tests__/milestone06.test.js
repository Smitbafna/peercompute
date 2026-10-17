/**
 * PeerCompute Milestone 06 - Real WebRTC connectivity and bidirectional DataChannel tests
 *
 * Tests the WebRTCConnectionManager: DataChannel creation order, offer/answer,
 * ICE buffering, connection events, send/not-open guard, cleanup, and the
 * processWebrtc* helper functions.
 *
 * WebRTC globals (RTCPeerConnection, RTCDataChannel, etc.) are mocked because
 * vitest runs in Node.js, which does not provide them natively.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebRTCConnectionManager, EventEmitter, processWebrtcOffer, processWebrtcAnswer, processWebrtcIceCandidate, } from "../lib/webrtc-connection-manager";
// ---------------------------------------------------------------------------
// WebRTC mock globals
// ---------------------------------------------------------------------------
// A minimal RTCDataChannel mock
class MockDataChannel {
    label;
    readyState = "connecting";
    binaryType = "blob";
    onopen = null;
    onmessage = null;
    onclose = null;
    onerror = null;
    sendCalls = [];
    closed = false;
    constructor(label) {
        this.label = label;
    }
    send(data) {
        this.sendCalls.push(data);
    }
    close() {
        this.closed = true;
        this.readyState = "closed";
    }
    triggerOpen() {
        this.readyState = "open";
        if (this.onopen)
            this.onopen(new Event("open"));
    }
    triggerMessage(data) {
        if (this.onmessage) {
            this.onmessage(new MessageEvent("message", { data }));
        }
    }
    triggerClose() {
        if (this.onclose)
            this.onclose(new Event("close"));
    }
}
// A minimal RTCPeerConnection mock
class MockRTCPeerConnection {
    _configuration;
    connectionState = "connecting";
    iceConnectionState = "new";
    signalingState = "stable";
    localDescription = null;
    remoteDescription = null;
    onicecandidate = null;
    onconnectionstatechange = null;
    ondatachannel = null;
    dataChannelCalls = [];
    createOfferCalls = 0;
    createAnswerCalls = 0;
    setLocalDescriptionCalls = [];
    setRemoteDescriptionCalls = [];
    addIceCandidateCalls = [];
    closed = false;
    createdDataChannel = null;
    constructor(_configuration) {
        this._configuration = _configuration;
    }
    createDataChannel(label) {
        this.dataChannelCalls.push(label);
        const dc = new MockDataChannel(label);
        this.createdDataChannel = dc;
        if (this.ondatachannel) {
            this.ondatachannel(new RTCDataChannelEvent("datachannel", { channel: dc }));
        }
        return dc;
    }
    async createOffer() {
        this.createOfferCalls++;
        return { type: "offer", sdp: "mock-offer-sdp" };
    }
    async createAnswer() {
        this.createAnswerCalls++;
        return { type: "answer", sdp: "mock-answer-sdp" };
    }
    async setLocalDescription(desc) {
        this.setLocalDescriptionCalls.push(desc);
        this.localDescription = new RTCSessionDescription(desc);
    }
    async setRemoteDescription(desc) {
        this.setRemoteDescriptionCalls.push(desc);
        this.remoteDescription = new RTCSessionDescription(desc);
        if (desc.type === "answer" && this.signalingState === "stable") {
            this.signalingState = "stable";
        }
    }
    async addIceCandidate(candidate) {
        this.addIceCandidateCalls.push(candidate);
    }
    close() {
        this.closed = true;
        this.connectionState = "closed";
    }
}
// Minimal RTCIceCandidate mock
class MockRTCIceCandidate {
    candidate;
    sdpMid;
    sdpMLineIndex;
    usernameFragment = null;
    constructor(candidateInit) {
        this.candidate = candidateInit.candidate ?? "";
        this.sdpMid = candidateInit.sdpMid ?? null;
        this.sdpMLineIndex = candidateInit.sdpMLineIndex ?? null;
    }
    toJSON() {
        return {
            candidate: this.candidate,
            sdpMid: this.sdpMid,
            sdpMLineIndex: this.sdpMLineIndex,
        };
    }
}
// Minimal RTCSessionDescription mock
class MockRTCSessionDescription {
    type;
    sdp;
    constructor(descriptionInit) {
        this.type = descriptionInit.type;
        this.sdp = descriptionInit.sdp ?? "";
    }
    toJSON() {
        return { type: this.type, sdp: this.sdp };
    }
}
// ---------------------------------------------------------------------------
// Install / uninstall mocks
// ---------------------------------------------------------------------------
let originalGlobals = {};
function installWebRTCMocks() {
    originalGlobals.RTCPeerConnection = globalThis.RTCPeerConnection;
    originalGlobals.RTCDataChannel = globalThis.RTCDataChannel;
    originalGlobals.RTCIceCandidate = globalThis.RTCIceCandidate;
    originalGlobals.RTCSessionDescription = globalThis.RTCSessionDescription;
    originalGlobals.RTCDataChannelEvent = globalThis.RTCDataChannelEvent;
    originalGlobals.RTCPeerConnectionIceEvent = globalThis.RTCPeerConnectionIceEvent;
    globalThis.RTCPeerConnection = MockRTCPeerConnection;
    globalThis.RTCDataChannel = MockDataChannel;
    globalThis.RTCIceCandidate = MockRTCIceCandidate;
    globalThis.RTCSessionDescription = MockRTCSessionDescription;
    globalThis.RTCDataChannelEvent = class extends Event {
        channel;
        constructor(type, eventInitDict) {
            super(type, eventInitDict);
            this.channel = eventInitDict.channel;
        }
    };
    globalThis.RTCPeerConnectionIceEvent = class extends Event {
        candidate;
        constructor(type, eventInitDict) {
            super(type, eventInitDict);
            this.candidate = eventInitDict.candidate ?? null;
        }
    };
}
function uninstallWebRTCMocks() {
    if (originalGlobals.RTCPeerConnection !== undefined) {
        globalThis.RTCPeerConnection = originalGlobals.RTCPeerConnection;
    }
    else {
        delete globalThis.RTCPeerConnection;
    }
    if (originalGlobals.RTCDataChannel !== undefined) {
        globalThis.RTCDataChannel = originalGlobals.RTCDataChannel;
    }
    else {
        delete globalThis.RTCDataChannel;
    }
    if (originalGlobals.RTCIceCandidate !== undefined) {
        globalThis.RTCIceCandidate = originalGlobals.RTCIceCandidate;
    }
    else {
        delete globalThis.RTCIceCandidate;
    }
    if (originalGlobals.RTCSessionDescription !== undefined) {
        globalThis.RTCSessionDescription = originalGlobals.RTCSessionDescription;
    }
    else {
        delete globalThis.RTCSessionDescription;
    }
    if (originalGlobals.RTCDataChannelEvent !== undefined) {
        globalThis.RTCDataChannelEvent = originalGlobals.RTCDataChannelEvent;
    }
    else {
        delete globalThis.RTCDataChannelEvent;
    }
    if (originalGlobals.RTCPeerConnectionIceEvent !== undefined) {
        globalThis.RTCPeerConnectionIceEvent = originalGlobals.RTCPeerConnectionIceEvent;
    }
    else {
        delete globalThis.RTCPeerConnectionIceEvent;
    }
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeManager(opts) {
    return new WebRTCConnectionManager({
        clientId: "test-client",
        role: "coordinator",
        send: vi.fn(),
        ...opts,
    });
}
function getPeerConnection(manager) {
    return manager.peerConnection;
}
function getDataChannel(manager) {
    return manager.dataChannel;
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("EventEmitter", () => {
    it("registers and emits handlers", () => {
        const emitter = new EventEmitter();
        const handler = vi.fn();
        emitter.on("test", handler);
        emitter.emit("test", "arg1", 42);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith("arg1", 42);
    });
    it("off removes a handler", () => {
        const emitter = new EventEmitter();
        const handler = vi.fn();
        emitter.on("test", handler);
        emitter.off("test", handler);
        emitter.emit("test");
        expect(handler).not.toHaveBeenCalled();
    });
    it("emit with no handlers does not throw", () => {
        const emitter = new EventEmitter();
        expect(() => emitter.emit("nonexistent")).not.toThrow();
    });
});
describe("WebRTCConnectionManager", () => {
    beforeEach(() => {
        installWebRTCMocks();
        vi.useFakeTimers();
    });
    afterEach(() => {
        uninstallWebRTCMocks();
        vi.useRealTimers();
    });
    describe("constructor", () => {
        it("creates a peer connection with ICE servers", () => {
            const manager = makeManager();
            const pc = getPeerConnection(manager);
            expect(pc).toBeInstanceOf(MockRTCPeerConnection);
            expect(pc._configuration.iceServers).toHaveLength(1);
            expect(pc._configuration.iceServers[0].urls).toBe("stun:stun.l.google.com:19302");
        });
        it("creates a DataChannel immediately in the constructor", () => {
            const manager = makeManager();
            const pc = getPeerConnection(manager);
            const dc = getDataChannel(manager);
            expect(pc.dataChannelCalls).toContain("peercompute-test");
            expect(dc).toBeInstanceOf(MockDataChannel);
            expect(dc.label).toBe("peercompute-test");
            expect(dc.readyState).toBe("connecting");
        });
        it("uses custom ICE servers when provided", () => {
            const manager = makeManager({
                iceServers: [{ urls: "turn:custom.example.com:3478" }],
            });
            const pc = getPeerConnection(manager);
            expect(pc._configuration.iceServers).toHaveLength(1);
            expect(pc._configuration.iceServers[0].urls).toBe("turn:custom.example.com:3478");
        });
    });
    describe("createOffer", () => {
        it("creates a DataChannel before creating the offer", async () => {
            const manager = makeManager();
            const pc = getPeerConnection(manager);
            const dc = getDataChannel(manager);
            expect(dc).not.toBeNull();
            expect(pc.dataChannelCalls).toContain("peercompute-test");
            const offer = await manager.createOffer();
            expect(offer.type).toBe("offer");
            expect(offer.sdp).toBe("mock-offer-sdp");
            expect(pc.createOfferCalls).toBe(1);
            expect(pc.setLocalDescriptionCalls).toContainEqual({ type: "offer", sdp: "mock-offer-sdp" });
        });
        it("creates the DataChannel if one does not exist yet", async () => {
            const manager = makeManager();
            const pc = getPeerConnection(manager);
            manager.dataChannel = null;
            manager.peerConnection = pc;
            const offer = await manager.createOffer();
            expect(offer.type).toBe("offer");
            expect(pc.createOfferCalls).toBe(1);
            expect(pc.dataChannelCalls.length).toBeGreaterThanOrEqual(1);
        });
    });
    describe("createAnswer", () => {
        it("applies the remote offer then creates an answer", async () => {
            const manager = makeManager();
            const pc = getPeerConnection(manager);
            const answer = await manager.createAnswer({ type: "offer", sdp: "remote-offer-sdp" });
            expect(answer.type).toBe("answer");
            expect(answer.sdp).toBe("mock-answer-sdp");
            expect(pc.createAnswerCalls).toBe(1);
            expect(pc.setRemoteDescriptionCalls).toContainEqual({ type: "offer", sdp: "remote-offer-sdp" });
            expect(pc.setLocalDescriptionCalls).toContainEqual({ type: "answer", sdp: "mock-answer-sdp" });
        });
        it("sets hasSetupRemoteDescription so buffered ICE candidates are flushed", async () => {
            const manager = makeManager();
            const pc = getPeerConnection(manager);
            // Buffer via the peer connection's onicecandidate handler
            const mockEvent = new globalThis.RTCPeerConnectionIceEvent("icecandidate", {
                candidate: new globalThis.RTCIceCandidate({ candidate: "candidate:0 1 udp 1 1.2.3.4 1234 typ host", sdpMid: "0" }),
            });
            getPeerConnection(manager).onicecandidate(mockEvent);
            expect(manager.candidateBuffer.length).toBe(1);
            await manager.createAnswer({ type: "offer", sdp: "remote-offer-sdp" });
            expect(pc.addIceCandidateCalls).toHaveLength(1);
            expect(manager.candidateBuffer.length).toBe(0);
        });
    });
    describe("setRemoteDescription", () => {
        it("applies the remote answer and flushes buffered candidates", async () => {
            const manager = makeManager();
            const pc = getPeerConnection(manager);
            const mockEvent = new globalThis.RTCPeerConnectionIceEvent("icecandidate", {
                candidate: new globalThis.RTCIceCandidate({ candidate: "candidate:0 1 udp 1 1.2.3.4 1234 typ host", sdpMid: "0" }),
            });
            getPeerConnection(manager).onicecandidate(mockEvent);
            expect(manager.candidateBuffer.length).toBe(1);
            await manager.setRemoteDescription({ type: "answer", sdp: "remote-answer-sdp" });
            expect(pc.setRemoteDescriptionCalls).toContainEqual({ type: "answer", sdp: "remote-answer-sdp" });
            expect(pc.addIceCandidateCalls).toHaveLength(1);
            expect(manager.candidateBuffer.length).toBe(0);
        });
    });
    describe("addIceCandidate", () => {
        it("applies candidates directly (no buffering - buffering happens in onIceCandidate)", async () => {
            const manager = makeManager();
            const pc = getPeerConnection(manager);
            await manager.addIceCandidate({ candidate: "cand-a", sdpMid: "0" });
            await manager.addIceCandidate({ candidate: "cand-b", sdpMid: "0" });
            // addIceCandidate applies directly, no buffering
            expect(pc.addIceCandidateCalls).toHaveLength(2);
            expect(manager.candidateBuffer.length).toBe(0);
        });
        it("buffers candidates via onIceCandidate until remote description is set", async () => {
            const manager = makeManager();
            const pc = getPeerConnection(manager);
            const mockEvent = new globalThis.RTCPeerConnectionIceEvent("icecandidate", {
                candidate: new globalThis.RTCIceCandidate({ candidate: "cand-a", sdpMid: "0" }),
            });
            getPeerConnection(manager).onicecandidate(mockEvent);
            const mockEvent2 = new globalThis.RTCPeerConnectionIceEvent("icecandidate", {
                candidate: new globalThis.RTCIceCandidate({ candidate: "cand-b", sdpMid: "0" }),
            });
            getPeerConnection(manager).onicecandidate(mockEvent2);
            expect(manager.candidateBuffer.length).toBe(2);
            expect(pc.addIceCandidateCalls).toHaveLength(0);
            await manager.setRemoteDescription({ type: "answer", sdp: "remote-answer-sdp" });
            expect(pc.addIceCandidateCalls).toHaveLength(2);
            expect(manager.candidateBuffer.length).toBe(0);
        });
        it("rejects when peer connection is not initialized", async () => {
            const manager = makeManager();
            manager.peerConnection = null;
            await expect(manager.addIceCandidate({ candidate: "cand" })).rejects.toThrow("Peer connection not initialized");
        });
    });
    describe("send", () => {
        it("sends a message when the DataChannel is open", () => {
            const manager = makeManager();
            const dc = getDataChannel(manager);
            dc.triggerOpen();
            manager.send("hello");
            expect(dc.sendCalls).toContain("hello");
        });
        it("throws when the DataChannel is not open", () => {
            const manager = makeManager();
            const dc = getDataChannel(manager);
            // readyState is "connecting" by default, not "open"
            expect(() => manager.send("hello")).toThrow("DataChannel is not open");
        });
        it("throws when the DataChannel is closed", () => {
            const manager = makeManager();
            const dc = getDataChannel(manager);
            dc.close();
            expect(() => manager.send("hello")).toThrow("DataChannel is not open");
        });
    });
    describe("connection events", () => {
        it("emits connect when DataChannel opens", () => {
            const manager = makeManager();
            const connectHandler = vi.fn();
            manager.on("connect", connectHandler);
            const dc = getDataChannel(manager);
            dc.triggerOpen();
            expect(connectHandler).toHaveBeenCalledTimes(1);
        });
        it("emits message when DataChannel receives data", () => {
            const manager = makeManager();
            const messageHandler = vi.fn();
            manager.on("message", messageHandler);
            const dc = getDataChannel(manager);
            dc.triggerMessage("hello from worker");
            expect(messageHandler).toHaveBeenCalledTimes(1);
            expect(messageHandler).toHaveBeenCalledWith("hello from worker");
        });
        it("emits close when DataChannel closes", () => {
            const manager = makeManager();
            const closeHandler = vi.fn();
            manager.on("close", closeHandler);
            const dc = getDataChannel(manager);
            dc.triggerClose();
            expect(closeHandler).toHaveBeenCalledTimes(1);
        });
        it("emits failed with a reason", () => {
            const manager = makeManager();
            const failedHandler = vi.fn();
            manager.on("failed", failedHandler);
            manager.onFailedBound("ICE connection failed");
            expect(failedHandler).toHaveBeenCalledTimes(1);
            expect(failedHandler).toHaveBeenCalledWith("ICE connection failed");
        });
        it("emits statechange on connection state change", () => {
            const manager = makeManager();
            const stateChangeHandler = vi.fn();
            manager.on("statechange", stateChangeHandler);
            manager.onStateChangeBound();
            expect(stateChangeHandler).toHaveBeenCalledTimes(1);
        });
    });
    describe("close", () => {
        it("closes the DataChannel and peer connection and emits close", () => {
            const manager = makeManager();
            const pc = getPeerConnection(manager);
            const dc = getDataChannel(manager);
            const closeHandler = vi.fn();
            manager.on("close", closeHandler);
            manager.close();
            expect(dc.closed).toBe(true);
            expect(pc.closed).toBe(true);
            expect(closeHandler).toHaveBeenCalledTimes(1);
            expect(manager.isClosed).toBe(true);
            expect(manager.candidateBuffer.length).toBe(0);
        });
        it("is idempotent - calling close twice does not throw", () => {
            const manager = makeManager();
            manager.close();
            expect(() => manager.close()).not.toThrow();
        });
        it("prevents sending after close", () => {
            const manager = makeManager();
            const dc = getDataChannel(manager);
            dc.triggerOpen();
            manager.close();
            expect(() => manager.send("after close")).toThrow("DataChannel is not open");
            expect(dc.sendCalls).not.toContain("after close");
        });
    });
});
describe("processWebrtcOffer", () => {
    beforeEach(() => {
        installWebRTCMocks();
    });
    afterEach(() => {
        uninstallWebRTCMocks();
    });
    it("applies the remote offer as setRemoteDescription", async () => {
        const manager = makeManager();
        const pc = getPeerConnection(manager);
        const offerMsg = {
            type: "WEBRTC_OFFER",
            clientId: "client-1",
            senderId: "client-1",
            receiverId: "client-2",
            sdp: "remote-offer-sdp",
            timestamp: Date.now(),
        };
        await processWebrtcOffer(manager, offerMsg);
        expect(pc.setRemoteDescriptionCalls).toContainEqual({ type: "offer", sdp: "remote-offer-sdp" });
    });
});
describe("processWebrtcAnswer", () => {
    beforeEach(() => {
        installWebRTCMocks();
    });
    afterEach(() => {
        uninstallWebRTCMocks();
    });
    it("applies the remote answer as setRemoteDescription", async () => {
        const manager = makeManager();
        const pc = getPeerConnection(manager);
        const answerMsg = {
            type: "WEBRTC_ANSWER",
            clientId: "client-1",
            senderId: "client-1",
            receiverId: "client-2",
            sdp: "remote-answer-sdp",
            timestamp: Date.now(),
        };
        await processWebrtcAnswer(manager, answerMsg);
        expect(pc.setRemoteDescriptionCalls).toContainEqual({ type: "answer", sdp: "remote-answer-sdp" });
    });
});
describe("processWebrtcIceCandidate", () => {
    beforeEach(() => {
        installWebRTCMocks();
    });
    afterEach(() => {
        uninstallWebRTCMocks();
    });
    it("adds the ICE candidate via addIceCandidate", async () => {
        const manager = makeManager();
        const pc = getPeerConnection(manager);
        const candidateMsg = {
            type: "WEBRTC_ICE_CANDIDATE",
            clientId: "client-1",
            senderId: "client-1",
            receiverId: "client-2",
            candidate: { candidate: "candidate:0 1 udp 1 1.2.3.4 1234 typ host", sdpMid: "0" },
            sdpMid: "0",
            timestamp: Date.now(),
        };
        await processWebrtcIceCandidate(manager, candidateMsg);
        expect(pc.addIceCandidateCalls).toHaveLength(1);
        expect(pc.addIceCandidateCalls[0]).toEqual({
            candidate: "candidate:0 1 udp 1 1.2.3.4 1234 typ host",
            sdpMid: "0",
            sdpMLineIndex: undefined,
        });
    });
});
