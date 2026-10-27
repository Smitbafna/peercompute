/**
 * WebRTC Connection Manager for PeerCompute Milestone 06
 */
import {
  MessageType,
  isTestMsg,
  isAckMsg,
  TestMsg,
  AckMsg,
} from "peercompute-shared";

export interface BaseMessage {
  type: string;
  timestamp: number;
}
export interface WebrtcIceMsg extends BaseMessage {
  type: "WEBRTC_ICE_CANDIDATE";
  clientId: string;
  senderId: string;
  receiverId: string;
  candidate: RTCIceCandidateInit;
  sdpMid?: string;
  sdpMLineIndex?: number;
}
export type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "closed";
export interface IcefEvent {
  candidate: RTCIceCandidateInit;
  sdpMid?: string;
  sdpMLineIndex?: number;
}
export interface WebrtcOfferMsg extends BaseMessage {
  type: "WEBRTC_OFFER";
  clientId: string;
  senderId: string;
  receiverId: string;
  sdp: string;
  timestamp: number;
}
export interface WebrtcAnswerMsg extends BaseMessage {
  type: "WEBRTC_ANSWER";
  clientId: string;
  senderId: string;
  receiverId: string;
  sdp: string;
  timestamp: number;
}
export interface ConnectionManagerOptions {
  clientId: string;
  role: "coordinator" | "worker";
  send: (msg: Record<string, unknown>) => void;
  iceServers?: RTCIceServer[];
  receiverId?: string;
  createDataChannel?: boolean;
}

export interface DataChannelEventMap {
  connect: () => void;
  message: (data: string) => void;
  close: () => void;
  statechange: () => void;
  failed: (reason: string) => void;
}

export class EventEmitter {
  private handlers: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  on<TEvent extends string>(
    event: TEvent,
    handler: (...args: unknown[]) => void,
  ): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(
        event,
        new Set<(...args: unknown[]) => void>(),
      );
    }
    this.handlers.get(event)!.add(handler);
  }

  off<TEvent extends string>(
    event: TEvent,
    handler: (...args: unknown[]) => void,
  ): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    handlers.delete(handler);
    if (handlers.size === 0) {
      this.handlers.delete(event);
    }
  }

  emit<TEvent extends string>(
    event: TEvent,
    ...args: unknown[]
  ): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      handler(...args);
    }
  }
}

export class WebRTCConnectionManager extends EventEmitter {
  public peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private candidateBuffer: IcefEvent[] = [];
  private isClosed = false;
  private isDisconnected = false;
  private hasSetupRemoteDescription = false;
  private remoteOpen = false;
  private messageHandlerAttached = false;
  private options: ConnectionManagerOptions;

  constructor(options: ConnectionManagerOptions) {
    super();
    this.options = options;
    const iceServers = options.iceServers || this.defaultIceServers();
    this.peerConnection = new RTCPeerConnection({ iceServers });
    this.setupPeerConnectionHandlers();
    this.createDataChannel();
  }

  private defaultIceServers(): RTCIceServer[] {
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }

  private createDataChannel(): void {
    if (!this.peerConnection || this.dataChannel) {
      return;
    }
    const dc = this.peerConnection.createDataChannel(
      "peercompute-test",
      { ordered: true },
    );
    this.dataChannel = dc;
    this.setupDataChannelHandlers();
  }

  private setupDataChannelHandlers(): void {
    if (!this.dataChannel) {
      return;
    }
    this.dataChannel.onopen = () => {
      this.remoteOpen = true;
      this.emit("connect");
    };
    this.dataChannel.onclose = () => {
      this.remoteOpen = false;
      this.emit("close");
    };
    this.dataChannel.onmessage = (event: MessageEvent<string>) => {
      this.emit("message", event.data);
    };
  }
  getConnectionState(): RTCPeerConnectionState {
    return this.peerConnection
      ? this.peerConnection.connectionState
      : "closed";
  }

  /** Returns whether the connection manager is closed. */
  getIsClosed(): boolean {
    return this.isClosed;
  }

  getSignalingState(): RTCSignalingState {
    return this.peerConnection
      ? this.peerConnection.signalingState
      : "closed";
  }
  private setupPeerConnectionHandlers(): void {
    if (!this.peerConnection) {
      return;
    }

    this.peerConnection.onicecandidate = (event: Event) => {
      const candidateEvent = event as RTCPeerConnectionIceEvent;
      const candidate = candidateEvent.candidate;
      if (candidate) {
        const msg: IcefEvent = {
          candidate: {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid || undefined,
            sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
          },
          sdpMid: candidate.sdpMid || undefined,
          sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
        };
        this.candidateBuffer.push(msg);
        this.options.send(
          this.serializeIceCandidate(msg, this.options.clientId),
        );
      } else {
        this.flushBufferedCandidates();
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      this.emit("statechange");
      if (state === "failed") {
        this.emit("failed", "Peer connection failed");
      }
      if (state === "disconnected" || state === "closed") {
        this.close();
      }
    };

    this.peerConnection.onsignalingstatechange = () => {
      this.emit("statechange");
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      if (state === "failed") {
        this.emit("failed", "ICE connection failed");
      }
      if (state === "disconnected" || state === "closed") {
        this.close();
      }
    };
  }

  private serializeIceCandidate(
    event: IcefEvent,
    senderId: string,
  ): Record<string, unknown> {
    const candidate = event.candidate as RTCIceCandidateInit;
    return {
      type: MessageType.WebrtcIceCandidate,
      timestamp: Date.now(),
      clientId: senderId,
      senderId,
      receiverId: this.options.receiverId || "",
      candidate,
      sdpMid: event.sdpMid,
      sdpMLineIndex: event.sdpMLineIndex,
    } as Record<string, unknown>;
  }
  /** Create the DataChannel first, then generate the offer. */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error("Peer connection not initialized");
    }
    const offer = await this.peerConnection.createOffer({
      offerToReceiveVideo: false,
      offerToReceiveAudio: false,
    });
    // Do NOT set local description here - it will be set after the remote answer is received.
    // This ensures the proper WebRTC signaling flow: remote sets remote desc first.
    this.flushBufferedCandidates();
    return offer;
  }
  /** Apply a coordinator offer, generate an answer, send it. */
  async createAnswer(remoteDescription: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error("Peer connection not initialized");
    }
    await this.peerConnection.setRemoteDescription(remoteDescription);
    this.hasSetupRemoteDescription = true;
    this.flushBufferedCandidates();
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  /** Apply a remote answer (normally generated by the other side). */
  async setRemoteDescription(
    desc: RTCSessionDescriptionInit,
  ): Promise<void> {
    if (!this.peerConnection) {
      throw new Error("Peer connection not initialized");
    }
    await this.peerConnection.setRemoteDescription(desc);
    this.hasSetupRemoteDescription = true;
    this.flushBufferedCandidates();
  }

  /** Set the local description for the peer connection. */
  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error("Peer connection not initialized");
    }
    await this.peerConnection.setLocalDescription(desc);
    this.hasSetupRemoteDescription = true;
    this.flushBufferedCandidates();
  }

  /** Send a text message through the DataChannel.
   * @throws {Error} if the DataChannel is not open.
   */
  send(message: string): void {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      throw new Error("DataChannel is not open");
    }
    this.dataChannel.send(message);
  }

  /** Close the DataChannel, peer connection, buffered candidates, and listeners. */
  close(): void {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;
    this.isDisconnected = true;

    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch (error) {
        console.error("Failed to close DataChannel:", error);
      }
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.candidateBuffer = [];
    this.emit("close");
  }

  private flushBufferedCandidates(): void {
    while (this.candidateBuffer.length > 0) {
      const event = this.candidateBuffer.shift()!;
      this.applyRemoteIceCandidate(event).catch((error) => {
        console.error("Failed to apply buffered ICE candidate:", error);
      });
    }
  }

  private async applyRemoteIceCandidate(
    event: IcefEvent,
  ): Promise<void> {
    if (!this.peerConnection) {
      return;
    }
    const candidate =
      event.candidate as RTCIceCandidateInit | undefined;
    if (!candidate) {
      return;
    }
    try {
      await this.peerConnection.addIceCandidate(candidate);
    } catch (error) {
      console.error("Failed to add ICE candidate:", error);
    }
  }

  /** Add a remote ICE candidate, optionally buffered until the remote description is available. */
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      return Promise.reject(new Error("Peer connection not initialized"));
    }
    // Buffer ICE candidate if remote description hasn't been set yet
    if (!this.hasSetupRemoteDescription) {
      this.candidateBuffer.push({ candidate } as IcefEvent);
      return Promise.resolve();
    }
    return this.peerConnection.addIceCandidate(candidate).catch((error) => {
      console.error("Failed to add ICE candidate:", error);
      return Promise.reject(error);
    });
  }

  private onConnectBound = (...args: unknown[]): void => {
    this.emit("connect");
  };

  private onMessageBound = (data: string, ...args: unknown[]): void => {
    this.emit("message", data);
  };

  private onCloseBound = (...args: unknown[]): void => {
    this.emit("close");
  };

  private onFailedBound = (reason: string, ...args: unknown[]): void => {
    this.emit("failed", reason);
  };

  private onStateChangeBound = (...args: unknown[]): void => {
    this.emit("statechange");
  };

  private onConnectionStateChangeBound = (...args: unknown[]): void => {
    this.emit("statechange");
  };

  private onIceConnectionStateChangeBound = (...args: unknown[]): void => {
    this.emit("statechange");
  };
}

export function processWebrtcOffer(manager: WebRTCConnectionManager, offerMsg: WebrtcOfferMsg): Promise<void> {
  return manager.setRemoteDescription({ type: "offer" as const, sdp: offerMsg.sdp });
}
export function processWebrtcAnswer(manager: WebRTCConnectionManager, answerMsg: WebrtcAnswerMsg): Promise<void> {
  return manager.setRemoteDescription({ type: "answer" as const, sdp: answerMsg.sdp });
}
export function processWebrtcIceCandidate(
  manager: WebRTCConnectionManager,
  candidateMsg: WebrtcIceMsg,
): Promise<void> {
  const iceCandidate: RTCIceCandidateInit = {
    candidate: candidateMsg.candidate.candidate,
    sdpMid: candidateMsg.candidate.sdpMid,
    sdpMLineIndex: candidateMsg.candidate.sdpMLineIndex,
  };
  return manager.addIceCandidate(iceCandidate);
}
