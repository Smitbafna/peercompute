/**
 * Protocol message shapes for PeerCompute.
 * Defines typed message shapes for the protocol categories required by the approved plan.
 * Uses a consistent `type` discriminator and defines sender/recipient identity fields where appropriate.
 * Distinguishes client-originated messages from server-originated messages where their shapes differ.
 * A client-generated UUID is an identifier, not authentication - clientId is not required on every message.
 */

// --- Message type discriminator ---

export enum MessageType {
  // Registration messages
  CoordinatorRegister = "COORDINATOR_REGISTER",
  WorkerRegister = "WORKER_REGISTER",

  // WebRTC signaling messages
  WebrtcOffer = "WEBRTC_OFFER",
  WebrtcAnswer = "WEBRTC_ANSWER",
  WebrtcIceCandidate = "WEBRTC_ICE_CANDIDATE",

  // Task messages
  TaskAssign = "TASK_ASSIGN",
  TaskResult = "TASK_RESULT",
  TaskProgress = "TASK_PROGRESS",

  // Error and control messages
  Error = "ERROR",
  Disconnect = "DISCONNECT"
}

// --- Base fields ---

export interface BaseMessage {
  type: MessageType;
  timestamp: number;
}

// --- Client-id message (includes clientId for client-originated messages) ---

export interface ClientMessage extends BaseMessage {
  clientId: string; // UUID string; identifier, not authentication
}

// --- Registration messages ---

export interface CoordinatorRegisterMsg extends ClientMessage {
  type: MessageType.CoordinatorRegister;
  role: "coordinator";
}

export interface WorkerRegisterMsg extends ClientMessage {
  type: MessageType.WorkerRegister;
  role: "worker";
  capabilities: string[];
}

// --- WebRTC signaling messages ---

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

// --- Task messages ---

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

// --- Error message ---

export interface ErrorMsg extends BaseMessage {
  type: MessageType.Error;
  code: string;
  message: string;
}

// --- Disconnect message ---

export interface DisconnectMsg extends BaseMessage {
  type: MessageType.Disconnect;
  reason: "normal" | "timeout" | "error";
}

// --- Union type for all messages ---

export type AllMessages =
  | CoordinatorRegisterMsg
  | WorkerRegisterMsg
  | WebrtcOfferMsg
  | WebrtcAnswerMsg
  | WebrtcIceCandidateMsg
  | TaskAssignMsg
  | TaskResultMsg
  | TaskProgressMsg
  | ErrorMsg
  | DisconnectMsg;

// Type guards

export function isCoordinatorRegisterMsg(msg: AllMessages): msg is CoordinatorRegisterMsg {
  return msg.type === MessageType.CoordinatorRegister;
}

export function isWorkerRegisterMsg(msg: AllMessages): msg is WorkerRegisterMsg {
  return msg.type === MessageType.WorkerRegister;
}

export function isWebrtcOfferMsg(msg: AllMessages): msg is WebrtcOfferMsg {
  return msg.type === MessageType.WebrtcOffer;
}

export function isWebrtcAnswerMsg(msg: AllMessages): msg is WebrtcAnswerMsg {
  return msg.type === MessageType.WebrtcAnswer;
}

export function isWebrtcIceCandidateMsg(msg: AllMessages): msg is WebrtcIceCandidateMsg {
  return msg.type === MessageType.WebrtcIceCandidate;
}

export function isTaskAssignMsg(msg: AllMessages): msg is TaskAssignMsg {
  return msg.type === MessageType.TaskAssign;
}

export function isTaskResultMsg(msg: AllMessages): msg is TaskResultMsg {
  return msg.type === MessageType.TaskResult;
}

export function isTaskProgressMsg(msg: AllMessages): msg is TaskProgressMsg {
  return msg.type === MessageType.TaskProgress;
}

export function isErrorMsg(msg: AllMessages): msg is ErrorMsg {
  return msg.type === MessageType.Error;
}

export function isDisconnectMsg(msg: AllMessages): msg is DisconnectMsg {
  return msg.type === MessageType.Disconnect;
}