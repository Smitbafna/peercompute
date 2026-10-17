/**
 * WebRTC Connection Manager for PeerCompute Milestone 06
 */
import { MessageType, } from "peercompute-shared";
export class EventEmitter {
    handlers = new Map();
    on(event, handler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event).add(handler);
    }
    off(event, handler) {
        const handlers = this.handlers.get(event);
        if (!handlers)
            return;
        handlers.delete(handler);
        if (handlers.size === 0) {
            this.handlers.delete(event);
        }
    }
    emit(event, ...args) {
        const handlers = this.handlers.get(event);
        if (!handlers)
            return;
        for (const handler of handlers) {
            handler(...args);
        }
    }
}
export class WebRTCConnectionManager extends EventEmitter {
    peerConnection = null;
    dataChannel = null;
    candidateBuffer = [];
    isClosed = false;
    isDisconnected = false;
    hasSetupRemoteDescription = false;
    remoteOpen = false;
    messageHandlerAttached = false;
    options;
    constructor(options) {
        super();
        this.options = options;
        const iceServers = options.iceServers || this.defaultIceServers();
        this.peerConnection = new RTCPeerConnection({ iceServers });
        this.setupPeerConnectionHandlers();
        this.createDataChannel();
    }
    defaultIceServers() {
        return [{ urls: "stun:stun.l.google.com:19302" }];
    }
    createDataChannel() {
        if (!this.peerConnection || this.dataChannel) {
            return;
        }
        const dc = this.peerConnection.createDataChannel("peercompute-test", { ordered: true });
        this.dataChannel = dc;
        this.setupDataChannelHandlers();
    }
    setupDataChannelHandlers() {
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
        this.dataChannel.onmessage = (event) => {
            this.emit("message", event.data);
        };
    }
    getConnectionState() {
        return this.peerConnection
            ? this.peerConnection.connectionState
            : "closed";
    }
    getSignalingState() {
        return this.peerConnection
            ? this.peerConnection.signalingState
            : "closed";
    }
    setupPeerConnectionHandlers() {
        if (!this.peerConnection) {
            return;
        }
        this.peerConnection.onicecandidate = (event) => {
            const candidateEvent = event;
            const candidate = candidateEvent.candidate;
            if (candidate) {
                const msg = {
                    candidate: {
                        candidate: candidate.candidate,
                        sdpMid: candidate.sdpMid || undefined,
                        sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
                    },
                    sdpMid: candidate.sdpMid || undefined,
                    sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
                };
                this.candidateBuffer.push(msg);
                this.options.send(this.serializeIceCandidate(msg, this.options.clientId));
            }
            else {
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
    serializeIceCandidate(event, senderId) {
        const candidate = event.candidate;
        return {
            type: MessageType.WebrtcIceCandidate,
            timestamp: Date.now(),
            clientId: senderId,
            senderId,
            receiverId: this.options.receiverId || "",
            candidate,
            sdpMid: event.sdpMid,
            sdpMLineIndex: event.sdpMLineIndex,
        };
    }
    /** Create the DataChannel first, then generate the offer. */
    async createOffer() {
        if (!this.peerConnection) {
            throw new Error("Peer connection not initialized");
        }
        const offer = await this.peerConnection.createOffer({
            offerToReceiveVideo: false,
            offerToReceiveAudio: false,
        });
        await this.peerConnection.setLocalDescription(offer);
        this.flushBufferedCandidates();
        return offer;
    }
    /** Apply a coordinator offer, generate an answer, send it. */
    async createAnswer(remoteDescription) {
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
    async setRemoteDescription(desc) {
        if (!this.peerConnection) {
            throw new Error("Peer connection not initialized");
        }
        await this.peerConnection.setRemoteDescription(desc);
        this.hasSetupRemoteDescription = true;
        this.flushBufferedCandidates();
    }
    /** Send a text message through the DataChannel.
     * @throws {Error} if the DataChannel is not open.
     */
    send(message) {
        if (!this.dataChannel || this.dataChannel.readyState !== "open") {
            throw new Error("DataChannel is not open");
        }
        this.dataChannel.send(message);
    }
    /** Close the DataChannel, peer connection, buffered candidates, and listeners. */
    close() {
        if (this.isClosed) {
            return;
        }
        this.isClosed = true;
        this.isDisconnected = true;
        if (this.dataChannel) {
            try {
                this.dataChannel.close();
            }
            catch (error) {
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
    flushBufferedCandidates() {
        while (this.candidateBuffer.length > 0) {
            const event = this.candidateBuffer.shift();
            this.applyRemoteIceCandidate(event).catch((error) => {
                console.error("Failed to apply buffered ICE candidate:", error);
            });
        }
    }
    async applyRemoteIceCandidate(event) {
        if (!this.peerConnection) {
            return;
        }
        const candidate = event.candidate;
        if (!candidate) {
            return;
        }
        try {
            await this.peerConnection.addIceCandidate(candidate);
        }
        catch (error) {
            console.error("Failed to add ICE candidate:", error);
        }
    }
    /** Add a remote ICE candidate, optionally buffered until the remote description is available. */
    addIceCandidate(candidate) {
        if (!this.peerConnection) {
            return Promise.reject(new Error("Peer connection not initialized"));
        }
        return this.peerConnection.addIceCandidate(candidate).catch((error) => {
            console.error("Failed to add ICE candidate:", error);
            return Promise.reject(error);
        });
    }
    onConnectBound = (...args) => {
        this.emit("connect");
    };
    onMessageBound = (data, ...args) => {
        this.emit("message", data);
    };
    onCloseBound = (...args) => {
        this.emit("close");
    };
    onFailedBound = (reason, ...args) => {
        this.emit("failed", reason);
    };
    onStateChangeBound = (...args) => {
        this.emit("statechange");
    };
    onConnectionStateChangeBound = (...args) => {
        this.emit("statechange");
    };
    onIceConnectionStateChangeBound = (...args) => {
        this.emit("statechange");
    };
}
export function processWebrtcOffer(manager, offerMsg) {
    return manager.setRemoteDescription({ type: "offer", sdp: offerMsg.sdp });
}
export function processWebrtcAnswer(manager, answerMsg) {
    return manager.setRemoteDescription({ type: "answer", sdp: answerMsg.sdp });
}
export function processWebrtcIceCandidate(manager, candidateMsg) {
    const iceCandidate = {
        candidate: candidateMsg.candidate.candidate,
        sdpMid: candidateMsg.candidate.sdpMid,
        sdpMLineIndex: candidateMsg.candidate.sdpMLineIndex,
    };
    return manager.addIceCandidate(iceCandidate);
}
