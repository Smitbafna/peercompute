export class EventEmitter {
    handlers = new Map;
    on(event, handler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, []);
        }
        this.handlers.get(event).push(handler);
    }
    off(event, handler) {
        const handlers = this.handlers.get(event);
        if (handlers) {
            const idx = handlers.indexOf(handler);
            if (idx !== -1) {
                handlers.splice(idx, 1);
            }
        }
    }
    emit(event, ...args) {
        const handlers = this.handlers.get(event);
        if (handlers) {
            for (const handler of handlers) {
                handler(...args);
            }
        }
    }
}
export class WebRTCConnectionManager extends EventEmitter {
    peerConnection = null;
    candidateBuffer = [];
    isClosed = false;
    remoteDescriptionSettled = false;
    options;
    constructor(options) {
        super();
        this.options = options;
        const iceServers = options.iceServers || this.defaultIceServers();
        this.peerConnection = new RTCPeerConnection({ iceServers });
        this.setupPeerConnectionHandlers();
    }
    defaultIceServers() {
        return [
            { urls: "stun:stun.l.google.com:19302" },
        ];
    }
    getConnectionState() {
        return this.peerConnection ? this.peerConnection.connectionState : "closed";
    }
    getSignalingState() {
        return this.peerConnection ? this.peerConnection.signalingState : "closed";
    }
    setupPeerConnectionHandlers() {
        if (!this.peerConnection)
            return;
        this.peerConnection.onicecandidate = (event) => {
            const candidateEvent = event;
            if (candidateEvent.candidate) {
                const candidateMsg = {
                    type: "WEBRTC_ICE_CANDIDATE",
                    clientId: this.options.clientId,
                    senderId: this.options.clientId,
                    receiverId: this.options.receiverId || "",
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
            }
            else {
                this.emit("closed");
            }
        };
    }
    async createOffer() {
        if (!this.peerConnection)
            throw new Error("Peer connection not initialized");
        const offer = await this.peerConnection.createOffer({
            offerToReceiveVideo: false,
            offerToReceiveAudio: false,
        });
        await this.peerConnection.setLocalDescription(offer);
        this.flushBufferedCandidates();
        return offer;
    }
    async createAnswer(remoteDescription) {
        if (!this.peerConnection)
            throw new Error("Peer connection not initialized");
        await this.peerConnection.setRemoteDescription(remoteDescription);
        this.flushBufferedCandidates();
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        return answer;
    }
    async setRemoteDescription(desc) {
        if (!this.peerConnection)
            throw new Error("Peer connection not initialized");
        await this.peerConnection.setRemoteDescription(desc);
        this.remoteDescriptionSettled = true;
        this.flushBufferedCandidates();
    }
    close() {
        if (this.isClosed)
            return;
        this.isClosed = true;
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        this.candidateBuffer = [];
        this.emit("closed");
    }
    flushBufferedCandidates() {
        while (this.candidateBuffer.length > 0) {
            const candidate = this.candidateBuffer.shift();
            this.addRemoteFingerprint(candidate.candidate, candidate.sdpMid, candidate.sdpMLineIndex);
        }
    }
    async addRemoteFingerprint(candidate, sdpMid, sdpMLineIndex) {
        if (!this.peerConnection)
            return;
        try {
            this.addIceCandidate(candidate);
        }
        catch (error) {
            console.error("Failed to add remote ICE candidate:", error);
        }
    }
    send(message) {
        this.options.send(message);
    }
    addIceCandidate(candidate) {
        if (!this.peerConnection)
            return;
        this.peerConnection.addIceCandidate(candidate).then(() => {
            // Candidate added successfully
        }).catch((error) => {
            console.error("Failed to add ICE candidate:", error);
        });
    }
}
export function processWebrtcOffer(manager, offerMsg) {
    return manager.setRemoteDescription({ type: "offer", sdp: offerMsg.sdp });
}
export function processWebrtcAnswer(manager, answerMsg) {
    return manager.setRemoteDescription({ type: "answer", sdp: answerMsg.sdp });
}
export function processWebrtcIceCandidate(manager, candidateMsg) {
    const iceCandidate = {
        candidate: candidateMsg.candidate,
        sdpMid: candidateMsg.sdpMid,
        sdpMLineIndex: candidateMsg.sdpMLineIndex,
    };
    manager.addIceCandidate(iceCandidate);
}
