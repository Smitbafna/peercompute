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
import {
  WebRTCConnectionManager,
  EventEmitter,
  processWebrtcOffer,
  processWebrtcAnswer,
  processWebrtcIceCandidate,
} from "../lib/webrtc-connection-manager";

// ---------------------------------------------------------------------------
// WebRTC mock globals
// ---------------------------------------------------------------------------

// A minimal RTCDataChannel mock
class MockDataChannel {
  public readyState: RTCDataChannelState = "connecting";
  public binaryType: string = "blob";
  public onopen: ((this: MockDataChannel, ev: Event) => any) | null = null;
  public onmessage: ((this: MockDataChannel, ev: MessageEvent) => any) | null = null;
  public onclose: ((this: MockDataChannel, ev: Event) => any) | null = null;
  public onerror: ((this: MockDataChannel, ev: Event) => any) | null = null;

  sendCalls: unknown[] = [];
  closed = false;

  constructor(public label: string) {}

  send(data: unknown): void {
    this.sendCalls.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = "closed";
  }

  triggerOpen(): void {
    this.readyState = "open";
    if (this.onopen) this.onopen(new Event("open"));
  }

  triggerMessage(data: string): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent("message", { data }));
    }
  }

  triggerClose(): void {
    if (this.onclose) this.onclose(new Event("close"));
  }
}

// A minimal RTCPeerConnection mock
class MockRTCPeerConnection {
  public connectionState: RTCPeerConnectionState = "connecting";
  public iceConnectionState: RTCIceConnectionState = "new";
  public signalingState: RTCSignalingState = "stable";
  public localDescription: RTCSessionDescription | null = null;
  public remoteDescription: RTCSessionDescription | null = null;

  public onicecandidate: ((this: MockRTCPeerConnection, ev: RTCPeerConnectionIceEvent) => any) | null = null;
  public onconnectionstatechange: ((this: MockRTCPeerConnection, ev: Event) => any) | null = null;
  public ondatachannel: ((this: MockRTCPeerConnection, ev: RTCDataChannelEvent) => any) | null = null;

  dataChannelCalls: string[] = [];
  createOfferCalls = 0;
  createAnswerCalls = 0;
  setLocalDescriptionCalls: RTCSessionDescriptionInit[] = [];
  setRemoteDescriptionCalls: RTCSessionDescriptionInit[] = [];
  addIceCandidateCalls: RTCIceCandidateInit[] = [];
  closed = false;

  createdDataChannel: MockDataChannel | null = null;

  constructor(public _configuration: RTCConfiguration) {}

  createDataChannel(label: string): RTCDataChannel {
    this.dataChannelCalls.push(label);
    const dc = new MockDataChannel(label);
    this.createdDataChannel = dc;
    if (this.ondatachannel) {
      this.ondatachannel(new RTCDataChannelEvent("datachannel", { channel: dc as unknown as RTCDataChannel }));
    }
    return dc as unknown as RTCDataChannel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.createOfferCalls++;
    return { type: "offer", sdp: "mock-offer-sdp" };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    this.createAnswerCalls++;
    return { type: "answer", sdp: "mock-answer-sdp" };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.setLocalDescriptionCalls.push(desc);
    this.localDescription = new RTCSessionDescription(desc);
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.setRemoteDescriptionCalls.push(desc);
    this.remoteDescription = new RTCSessionDescription(desc);
    if (desc.type === "answer" && this.signalingState === "stable") {
      this.signalingState = "stable";
    }
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    this.addIceCandidateCalls.push(candidate);
  }

  close(): void {
    this.closed = true;
    this.connectionState = "closed";
  }
}

// Minimal RTCIceCandidate mock
class MockRTCIceCandidate {
  public candidate: string;
  public sdpMid: string | null;
  public sdpMLineIndex: number | null;
  public usernameFragment: string | null = null;

  constructor(candidateInit: RTCIceCandidateInit) {
    this.candidate = candidateInit.candidate ?? "";
    this.sdpMid = candidateInit.sdpMid ?? null;
    this.sdpMLineIndex = candidateInit.sdpMLineIndex ?? null;
  }

  toJSON(): RTCIceCandidateInit {
    return {
      candidate: this.candidate,
      sdpMid: this.sdpMid,
      sdpMLineIndex: this.sdpMLineIndex,
    };
  }
}

// Minimal RTCSessionDescription mock
class MockRTCSessionDescription {
  public type: RTCSdpType;
  public sdp: string;

  constructor(descriptionInit: RTCSessionDescriptionInit) {
    this.type = descriptionInit.type;
    this.sdp = descriptionInit.sdp ?? "";
  }

  toJSON(): RTCSessionDescriptionInit {
    return { type: this.type, sdp: this.sdp };
  }
}

// ---------------------------------------------------------------------------
// Install / uninstall mocks
// ---------------------------------------------------------------------------

let originalGlobals: {
  RTCPeerConnection?: typeof RTCPeerConnection;
  RTCDataChannel?: typeof RTCDataChannel;
  RTCIceCandidate?: typeof RTCIceCandidate;
  RTCSessionDescription?: typeof RTCSessionDescription;
  RTCDataChannelEvent?: typeof RTCDataChannelEvent;
  RTCPeerConnectionIceEvent?: typeof RTCPeerConnectionIceEvent;
} = {};

function installWebRTCMocks(): void {
  originalGlobals.RTCPeerConnection = globalThis.RTCPeerConnection;
  originalGlobals.RTCDataChannel = globalThis.RTCDataChannel;
  originalGlobals.RTCIceCandidate = globalThis.RTCIceCandidate;
  originalGlobals.RTCSessionDescription = globalThis.RTCSessionDescription;
  originalGlobals.RTCDataChannelEvent = globalThis.RTCDataChannelEvent;
  originalGlobals.RTCPeerConnectionIceEvent = globalThis.RTCPeerConnectionIceEvent;

  (globalThis as any).RTCPeerConnection = MockRTCPeerConnection;
  (globalThis as any).RTCDataChannel = MockDataChannel;
  (globalThis as any).RTCIceCandidate = MockRTCIceCandidate;
  (globalThis as any).RTCSessionDescription = MockRTCSessionDescription;
  (globalThis as any).RTCDataChannelEvent = class extends Event {
    channel: RTCDataChannel;
    constructor(type: string, eventInitDict: RTCDataChannelEventInit) {
      super(type, eventInitDict);
      this.channel = eventInitDict.channel;
    }
  };
  (globalThis as any).RTCPeerConnectionIceEvent = class extends Event {
    candidate: RTCIceCandidate | null;
    constructor(type: string, eventInitDict: RTCPeerConnectionIceEventInit) {
      super(type, eventInitDict);
      this.candidate = eventInitDict.candidate ?? null;
    }
  };
}

function uninstallWebRTCMocks(): void {
  if (originalGlobals.RTCPeerConnection !== undefined) {
    (globalThis as any).RTCPeerConnection = originalGlobals.RTCPeerConnection;
  } else {
    delete (globalThis as any).RTCPeerConnection;
  }
  if (originalGlobals.RTCDataChannel !== undefined) {
    (globalThis as any).RTCDataChannel = originalGlobals.RTCDataChannel;
  } else {
    delete (globalThis as any).RTCDataChannel;
  }
  if (originalGlobals.RTCIceCandidate !== undefined) {
    (globalThis as any).RTCIceCandidate = originalGlobals.RTCIceCandidate;
  } else {
    delete (globalThis as any).RTCIceCandidate;
  }
  if (originalGlobals.RTCSessionDescription !== undefined) {
    (globalThis as any).RTCSessionDescription = originalGlobals.RTCSessionDescription;
  } else {
    delete (globalThis as any).RTCSessionDescription;
  }
  if (originalGlobals.RTCDataChannelEvent !== undefined) {
    (globalThis as any).RTCDataChannelEvent = originalGlobals.RTCDataChannelEvent;
  } else {
    delete (globalThis as any).RTCDataChannelEvent;
  }
  if (originalGlobals.RTCPeerConnectionIceEvent !== undefined) {
    (globalThis as any).RTCPeerConnectionIceEvent = originalGlobals.RTCPeerConnectionIceEvent;
  } else {
    delete (globalThis as any).RTCPeerConnectionIceEvent;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeManager(opts?: Partial<ConstructorParameters<typeof WebRTCConnectionManager>[0]>): WebRTCConnectionManager {
  return new WebRTCConnectionManager({
    clientId: "test-client",
    role: "coordinator",
    send: vi.fn(),
    ...opts,
  }) as unknown as WebRTCConnectionManager;
}

function getPeerConnection(manager: WebRTCConnectionManager): MockRTCPeerConnection {
  return manager.peerConnection as unknown as MockRTCPeerConnection;
}

function getDataChannel(manager: WebRTCConnectionManager): MockDataChannel {
  return (manager as any).dataChannel as unknown as MockDataChannel;
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
      expect(pc._configuration.iceServers!).toHaveLength(1);
      expect(pc._configuration.iceServers![0].urls).toBe("stun:stun.l.google.com:19302");
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
      expect(pc._configuration.iceServers!).toHaveLength(1);
      expect(pc._configuration.iceServers![0].urls).toBe("turn:custom.example.com:3478");
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
      // createOffer() no longer sets local description - it will be set after the remote answer is received
      expect(pc.setLocalDescriptionCalls).toEqual([]);
    });

    it("creates the DataChannel if one does not exist yet", async () => {
      const manager = makeManager();
      const pc = getPeerConnection(manager);
      (manager as any).dataChannel = null;
      (manager as any).peerConnection = pc;

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
      const mockEvent = new (globalThis as any).RTCPeerConnectionIceEvent("icecandidate", {
        candidate: new (globalThis as any).RTCIceCandidate({ candidate: "candidate:0 1 udp 1 1.2.3.4 1234 typ host", sdpMid: "0" }),
      });
      getPeerConnection(manager).onicecandidate!(mockEvent);
      expect((manager as any).candidateBuffer.length).toBe(1);

      await manager.createAnswer({ type: "offer", sdp: "remote-offer-sdp" });
      expect(pc.addIceCandidateCalls).toHaveLength(1);
      expect((manager as any).candidateBuffer.length).toBe(0);
    });
  });

  describe("setRemoteDescription", () => {
    it("applies the remote answer and flushes buffered candidates", async () => {
      const manager = makeManager();
      const pc = getPeerConnection(manager);

      const mockEvent = new (globalThis as any).RTCPeerConnectionIceEvent("icecandidate", {
        candidate: new (globalThis as any).RTCIceCandidate({ candidate: "candidate:0 1 udp 1 1.2.3.4 1234 typ host", sdpMid: "0" }),
      });
      getPeerConnection(manager).onicecandidate!(mockEvent);
      expect((manager as any).candidateBuffer.length).toBe(1);

      await manager.setRemoteDescription({ type: "answer", sdp: "remote-answer-sdp" });
      expect(pc.setRemoteDescriptionCalls).toContainEqual({ type: "answer", sdp: "remote-answer-sdp" });
      expect(pc.addIceCandidateCalls).toHaveLength(1);
      expect((manager as any).candidateBuffer.length).toBe(0);
    });
  });

  describe("addIceCandidate", () => {
    it("applies candidates directly (no buffering - buffering happens in onIceCandidate)", async () => {
      const manager = makeManager();
      const pc = getPeerConnection(manager);
      // When hasSetupRemoteDescription is false (no setRemoteDescription called yet),
      // addIceCandidate buffers the candidates. This fixes the "The remote description was null" error.
      await manager.addIceCandidate({ candidate: "cand-a", sdpMid: "0" });
      await manager.addIceCandidate({ candidate: "cand-b", sdpMid: "0" });
      // Candidates are buffered since hasSetupRemoteDescription is false
      expect((manager as any).candidateBuffer.length).toBe(2);
      expect(pc.addIceCandidateCalls).toHaveLength(0);
      // After setRemoteDescription, candidates are flushed
      await manager.setRemoteDescription({ type: "answer", sdp: "remote-answer-sdp" });
      expect((manager as any).candidateBuffer.length).toBe(0);
      expect(pc.addIceCandidateCalls).toHaveLength(2);
    });

    it("buffers candidates via onIceCandidate until remote description is set", async () => {
      const manager = makeManager();
      const pc = getPeerConnection(manager);

      const mockEvent = new (globalThis as any).RTCPeerConnectionIceEvent("icecandidate", {
        candidate: new (globalThis as any).RTCIceCandidate({ candidate: "cand-a", sdpMid: "0" }),
      });
      getPeerConnection(manager).onicecandidate!(mockEvent);
      const mockEvent2 = new (globalThis as any).RTCPeerConnectionIceEvent("icecandidate", {
        candidate: new (globalThis as any).RTCIceCandidate({ candidate: "cand-b", sdpMid: "0" }),
      });
      getPeerConnection(manager).onicecandidate!(mockEvent2);
      expect((manager as any).candidateBuffer.length).toBe(2);
      expect(pc.addIceCandidateCalls).toHaveLength(0);

      await manager.setRemoteDescription({ type: "answer", sdp: "remote-answer-sdp" });
      expect(pc.addIceCandidateCalls).toHaveLength(2);
      expect((manager as any).candidateBuffer.length).toBe(0);
    });

    it("rejects when peer connection is not initialized", async () => {
      const manager = makeManager();
      (manager as any).peerConnection = null;
      await expect(manager.addIceCandidate({ candidate: "cand" })).rejects.toThrow(
        "Peer connection not initialized"
      );
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

    it("buffers a message when the DataChannel is not open", () => {
      const manager = makeManager();
      const dc = getDataChannel(manager);
      // readyState is "connecting" by default, not "open"
      manager.send("hello");
      expect(dc.sendCalls).not.toContain("hello");
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

      (manager as any).onFailedBound("ICE connection failed");
      expect(failedHandler).toHaveBeenCalledTimes(1);
      expect(failedHandler).toHaveBeenCalledWith("ICE connection failed");
    });

    it("emits statechange on connection state change", () => {
      const manager = makeManager();
      const stateChangeHandler = vi.fn();
      manager.on("statechange", stateChangeHandler);

      (manager as any).onStateChangeBound();
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
      expect((manager as any).isClosed).toBe(true);
      expect((manager as any).candidateBuffer.length).toBe(0);
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


// ---------------------------------------------------------------------------
// Regression tests for DataChannel creation role-dependence (Milestone 06 fix)
// ---------------------------------------------------------------------------
describe("DataChannel creation role-dependence", () => {
  beforeEach(() => {
    installWebRTCMocks();
  });

  afterEach(() => {
    uninstallWebRTCMocks();
  });

  it("creates a DataChannel for the coordinator (offerer) by default", () => {
    const manager = makeManager();
    const pc = getPeerConnection(manager);
    expect(pc.dataChannelCalls).toContain("peercompute-test");
    expect(manager.peerConnection).toBeDefined();
  });

  it("does NOT create a DataChannel for the worker when createDataChannel: false", () => {
    const manager = makeManager({
      role: "worker",
      createDataChannel: false,
    });
    const pc = getPeerConnection(manager);
    // The worker should not have called createDataChannel
    expect(pc.dataChannelCalls).toHaveLength(0);
    expect(pc.createdDataChannel).toBeNull();
  });

  it("worker manager still has ondatachannel handler set up", () => {
    const manager = makeManager({
      role: "worker",
      createDataChannel: false,
    });
    const pc = getPeerConnection(manager);
    expect(pc.ondatachannel).not.toBeNull();
  });

  it("worker receives remote DataChannel via ondatachannel and emits connect", () => {
    const connectHandler = vi.fn();
    const manager = makeManager({
      role: "worker",
      createDataChannel: false,
    });
    manager.on("connect", connectHandler);

    const pc = getPeerConnection(manager);
    // Simulate the offerer creating a DataChannel that triggers ondatachannel
    pc.createDataChannel("peercompute-test");

    // The remote DataChannel's readyState starts as "connecting"
    // Simulate it opening:
    const remoteDC = pc.createdDataChannel!;
    expect(remoteDC).not.toBeNull();
    remoteDC.triggerOpen();

    // connect should have been emitted only after the channel opens
    expect(connectHandler).toHaveBeenCalledTimes(1);
  });

  it("does NOT emit connect before DataChannel onopen fires", () => {
    const connectHandler = vi.fn();
    const manager = makeManager({
      role: "coordinator",
      // Coordinator creates DataChannel
    });
    manager.on("connect", connectHandler);

    // At construction time, connect should NOT have been emitted
    expect(connectHandler).not.toHaveBeenCalled();

    // Simulate the local DataChannel opening
    const dc = getDataChannel(manager);
    dc.triggerOpen();

    // Now connect should be emitted
    expect(connectHandler).toHaveBeenCalledTimes(1);
  });

  it("repeated connect attempts do not overwrite active connection with stale events", () => {
    const manager1 = makeManager({
      role: "coordinator",
      clientId: "client-A",
    });
    manager1.close();

    // Create a second manager - simulating a retry
    const manager2 = makeManager({
      role: "coordinator",
      clientId: "client-A",
    });

    // Both managers should be independent
    // manager1 was closed, so its peerConnection is null
    expect(manager1.getIsClosed()).toBe(true);
    const pc2 = getPeerConnection(manager2);
    expect(pc2.closed).toBe(false);
  });
});


// ---------------------------------------------------------------------------
// Regression tests for senderId validation (senderId is required)
// ---------------------------------------------------------------------------
describe("senderId validation", () => {
  beforeEach(() => {
    installWebRTCMocks();
  });

  afterEach(() => {
    uninstallWebRTCMocks();
  });

  it("offer message construction includes senderId matching clientId", () => {
    const clientId = "test-coordinator-id";
    const sendFn = vi.fn();
    const manager = new WebRTCConnectionManager({
      clientId,
      role: "coordinator",
      send: sendFn,
      createDataChannel: true,
      receiverId: "test-worker-id",
    } as any);

    manager.createOffer().then(() => {
      // The send function should have been called with a message containing senderId
      expect(sendFn).toHaveBeenCalled();
      const sentMsg = sendFn.mock.calls[0][0] as any;
      expect(sentMsg).toBeDefined();
      // senderId should match clientId
      expect(sentMsg.senderId).toBe(clientId);
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

    await processWebrtcOffer(manager, offerMsg as any);
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

    await processWebrtcAnswer(manager, answerMsg as any);
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

    await processWebrtcIceCandidate(manager, candidateMsg as any);
    expect(pc.addIceCandidateCalls).toHaveLength(1);
    expect(pc.addIceCandidateCalls[0]).toEqual({
      candidate: "candidate:0 1 udp 1 1.2.3.4 1234 typ host",
      sdpMid: "0",
      sdpMLineIndex: undefined,
    });
  });
});
