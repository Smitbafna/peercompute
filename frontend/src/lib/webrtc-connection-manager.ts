/**
 * WebRTC Connection Manager for PeerCompute Milestone 04
 */
export interface BaseMessage {
  type: string;
  timestamp: number;
}
export interface WebrtcIceMsg extends BaseMessage {
  type: "WEBRTC_ICE_CANDIDATE";
  senderId: string;
  receiverId: string;
  candidate: RTCIceCandidate;
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
  candidate: RTCIceCandidate;
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
}
export class EventEmitter {
  private handlers: Map<string, Function[]> = new Map;
  on(event: string, handler: Function) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }
  off(event: string, handler: Function) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) {
        handlers.splice(idx, 1);
      }
    }
  }
  emit(event: string, ...args: any[]) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(...args);
      }
    }
  }
}
export class WebRTCConnectionManager extends EventEmitter {
  public peerConnection: RTCPeerConnection | null = null;
  private candidateBuffer: IcefEvent[] = [];
  private isClosed = false;
  private remoteDescriptionSettled = false;
  private options: ConnectionManagerOptions;
  constructor(options: ConnectionManagerOptions) {
    super();
    this.options = options;
    const iceServers = options.iceServers || this.defaultIceServers();
    this.peerConnection = new RTCPeerConnection({ iceServers });
    this.setupPeerConnectionHandlers();
  }
  private defaultIceServers(): RTCIceServer[] {
    return [
      { urls: "stun:stun.l.google.com:19302" },
    ];
  }
  getConnectionState(): RTCPeerConnectionState {
    return this.peerConnection ? this.peerConnection.connectionState : "closed";
  }
  getSignalingState(): RTCSignalingState {
    return this.peerConnection ? this.peerConnection.signalingState : "closed";
  }
  private setupPeerConnectionHandlers() {
    if (!this.peerConnection) return;
    this.peerConnection.onicecandidate = (event: Event) => {
      const candidateEvent = event as any;
      if (candidateEvent.candidate) {
        const candidateMsg: Record<string, unknown> = {
          type: "WEBRTC_ICE_CANDIDATE",
          clientId: this.options.clientId,
          senderId: this.options.clientId,
          receiverId: "",
          candidate: candidateEvent.candidate,
          sdpMid: candidateEvent.candidate.sdpMid,
          sdpMLineIndex: candidateEvent.candidate.sdpMLineIndex,
        };
        this.options.send(candidateMsg);
        this.emit("icef", {
          candidate: candidateEvent.candidate,
          sdpMid: candidateEvent.candidate.sdpMid,
          sdpMLineIndex: candidateEvent.candidate.sdpMLineIndex,
        });
      } else {
        this.emit("closed");
      }
    };
  }
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) throw new Error("Peer connection not initialized");
    const offer = await this.peerConnection.createOffer({
      offerToReceiveVideo: false,
      offerToReceiveAudio: false,
    });
    await this.peerConnection.setLocalDescription(offer);
    this.flushBufferedCandidates();
    return offer;
  }
  async createAnswer(remoteDescription: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) throw new Error("Peer connection not initialized");
    await this.peerConnection.setRemoteDescription(remoteDescription);
    this.flushBufferedCandidates();
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }
  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) throw new Error("Peer connection not initialized");
    await this.peerConnection.setRemoteDescription(desc);
    this.remoteDescriptionSettled = true;
    this.flushBufferedCandidates();
  }
  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.candidateBuffer = [];
    this.emit("closed");
  }
  private flushBufferedCandidates() {
    while (this.candidateBuffer.length > 0) {
      const candidate = this.candidateBuffer.shift()!;
      this.addRemoteFingerprint(candidate.candidate, candidate.sdpMid, candidate.sdpMLineIndex);
    }
  }
  private async addRemoteFingerprint(
    candidate: RTCIceCandidateInit,
    sdpMid?: string | undefined,
    sdpMLineIndex?: number | undefined
  ): Promise<void> {
    if (!this.peerConnection) return;
    try {
      this.addIceCandidate(candidate);
    } catch (error) {
      console.error("Failed to add remote ICE candidate:", error);
    }
  }
  public addIceCandidate(candidate: RTCIceCandidateInit): void {
    if (!this.peerConnection) return;
    this.peerConnection.addIceCandidate(candidate).then(() => {
      // Candidate added successfully
    }).catch((error) => {
      console.error("Failed to add ICE candidate:", error);
    });
  }
}
export function processWebrtcOffer(manager: WebRTCConnectionManager, offerMsg: WebrtcOfferMsg): Promise<void> {
  return manager.setRemoteDescription({ type: "offer" as const, sdp: offerMsg.sdp });
}
export function processWebrtcAnswer(manager: WebRTCConnectionManager, answerMsg: WebrtcAnswerMsg): Promise<void> {
  return manager.setRemoteDescription({ type: "answer" as const, sdp: answerMsg.sdp });
}
export function processWebrtcIceCandidate(manager: WebRTCConnectionManager, candidateMsg: any): void {
  const iceCandidate: RTCIceCandidateInit = {
    candidate: candidateMsg.candidate,
    sdpMid: candidateMsg.sdpMid,
    sdpMLineIndex: candidateMsg.sdpMLineIndex,
  };
  manager.addIceCandidate(iceCandidate);
}
