/**
 * Protocol message shapes for PeerCompute.
 * Defines typed message shapes for the protocol categories required by the approved plan.
 * Uses a consistent `type` discriminator and defines sender/recipient identity fields where appropriate.
 * Distinguishes client-originated messages from server-originated messages where their shapes differ.
 * A client-generated UUID is an identifier, not authentication - clientId is not required on every message.
 */
export declare enum MessageType {
    CoordinatorRegister = "COORDINATOR_REGISTER",
    WorkerRegister = "WORKER_REGISTER",
    RegistrationSuccess = "REGISTRATION_SUCCESS",
    WorkerDiscoveryRequest = "WORKER_DISCOVERY_REQUEST",
    WorkerDiscoveryResponse = "WORKER_DISCOVERY_RESPONSE",
    WebrtcOffer = "WEBRTC_OFFER",
    WebrtcAnswer = "WEBRTC_ANSWER",
    WebrtcIceCandidate = "WEBRTC_ICE_CANDIDATE",
    TaskAssign = "TASK_ASSIGN",
    TaskResult = "TASK_RESULT",
    TaskProgress = "TASK_PROGRESS",
    Error = "ERROR",
    Disconnect = "DISCONNECT"
}
export interface BaseMessage {
    type: MessageType;
    timestamp: number;
}
/** Alias retained for backward compatibility with validators.ts and existing code. */
export type BaseMessageFields = BaseMessage;
/** Server-originated message (clientId is optional). */
export interface ServerMessage extends BaseMessage {
}
export interface ClientMessage extends BaseMessage {
    clientId: string;
}
export interface CoordinatorRegisterMsg extends ClientMessage {
    type: MessageType.CoordinatorRegister;
    role: "coordinator";
}
export interface WorkerRegisterMsg extends ClientMessage {
    type: MessageType.WorkerRegister;
    role: "worker";
    capabilities: string[];
}
/** Success response sent by the server after a client registers. */
export interface RegistrationSuccessMsg extends BaseMessage {
    type: MessageType.RegistrationSuccess;
    clientId: string;
    role: "coordinator" | "worker";
}
export interface PeerInfo {
    clientId: string;
    role: "coordinator" | "worker";
}
/** A coordinator sends this to request the list of registered workers. */
export interface WorkerDiscoveryRequestMsg extends ClientMessage {
    type: MessageType.WorkerDiscoveryRequest;
}
/** The server sends this (in response or as a push) to report available workers. */
export interface WorkerDiscoveryResponseMsg extends BaseMessage {
    type: MessageType.WorkerDiscoveryResponse;
    workers: PeerInfo[];
}
export interface WebrtcOfferMsg extends ClientMessage {
    type: MessageType.WebrtcOffer;
    senderId: string;
    receiverId: string;
    sdp: string;
}
export interface WebrtcAnswerMsg extends ClientMessage {
    type: MessageType.WebrtcAnswer;
    senderId: string;
    receiverId: string;
    sdp: string;
}
export interface WebrtcIceCandidateMsg extends ClientMessage {
    type: MessageType.WebrtcIceCandidate;
    senderId: string;
    receiverId: string;
    candidate: RTCIceCandidateInit;
    sdpMid?: string;
    sdpMLineIndex?: number;
}
export interface TaskAssignMsg extends ClientMessage {
    type: MessageType.TaskAssign;
    taskId: string;
    jobId: string;
    taskIndex: number;
    inputData: unknown;
    deadline?: number;
}
export interface TaskResultMsg extends ClientMessage {
    type: MessageType.TaskResult;
    taskId: string;
    result: number;
}
export interface TaskProgressMsg extends ClientMessage {
    type: MessageType.TaskProgress;
    taskId: string;
    progress: number;
}
export interface ErrorMsg extends BaseMessage {
    type: MessageType.Error;
    code: string;
    message: string;
}
export interface DisconnectMsg extends BaseMessage {
    type: MessageType.Disconnect;
    reason: "normal" | "timeout" | "error";
}
export type AllMessages = CoordinatorRegisterMsg | WorkerRegisterMsg | RegistrationSuccessMsg | WorkerDiscoveryRequestMsg | WorkerDiscoveryResponseMsg | WebrtcOfferMsg | WebrtcAnswerMsg | WebrtcIceCandidateMsg | TaskAssignMsg | TaskResultMsg | TaskProgressMsg | ErrorMsg | DisconnectMsg;
export declare function isCoordinatorRegisterMsg(msg: BaseMessage): msg is CoordinatorRegisterMsg;
export declare function isWorkerRegisterMsg(msg: BaseMessage): msg is WorkerRegisterMsg;
export declare function isRegistrationSuccessMsg(msg: BaseMessage): msg is RegistrationSuccessMsg;
export declare function isWorkerDiscoveryRequestMsg(msg: BaseMessage): msg is WorkerDiscoveryRequestMsg;
export declare function isWorkerDiscoveryResponseMsg(msg: BaseMessage): msg is WorkerDiscoveryResponseMsg;
export declare function isWebrtcOfferMsg(msg: BaseMessage): msg is WebrtcOfferMsg;
export declare function isWebrtcAnswerMsg(msg: BaseMessage): msg is WebrtcAnswerMsg;
export declare function isWebrtcIceCandidateMsg(msg: BaseMessage): msg is WebrtcIceCandidateMsg;
export declare function isTaskAssignMsg(msg: BaseMessage): msg is TaskAssignMsg;
export declare function isTaskResultMsg(msg: BaseMessage): msg is TaskResultMsg;
export declare function isTaskProgressMsg(msg: BaseMessage): msg is TaskProgressMsg;
export declare function isErrorMsg(msg: BaseMessage): msg is ErrorMsg;
export declare function isDisconnectMsg(msg: BaseMessage): msg is DisconnectMsg;
