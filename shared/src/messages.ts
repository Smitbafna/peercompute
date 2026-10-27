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
  RegistrationSuccess = "REGISTRATION_SUCCESS",

  // Discovery messages (Milestone 05)
  WorkerDiscoveryRequest = "WORKER_DISCOVERY_REQUEST",
  WorkerDiscoveryResponse = "WORKER_DISCOVERY_RESPONSE",

  // WebRTC signaling messages
  WebrtcOffer = "WEBRTC_OFFER",
  WebrtcAnswer = "WEBRTC_ANSWER",
  WebrtcIceCandidate = "WEBRTC_ICE_CANDIDATE",

  // Task messages
  TaskAssign = "TASK_ASSIGN",
  TaskResult = "TASK_RESULT",
  TaskProgress = "TASK_PROGRESS",
  TaskFailure = "TASK_FAILURE",

  // Test messages (Milestone 07)
  Test = "TEST",
  Ack = "ACK",

  // Error and control messages
  Error = "ERROR",
  Disconnect = "DISCONNECT"
}

// --- Base fields ---

export interface BaseMessage {
  type: MessageType;
  timestamp: number;
}

/** Alias retained for backward compatibility with validators.ts and existing code. */
export type BaseMessageFields = BaseMessage;

/** Server-originated message (clientId is optional). */
export interface ServerMessage extends BaseMessage {}

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

/** Success response sent by the server after a client registers. */
export interface RegistrationSuccessMsg extends BaseMessage {
  type: MessageType.RegistrationSuccess;
  clientId: string;
  role: "coordinator" | "worker";
}

// --- Discovery messages (Milestone 05) ---

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
  sampleCount: number;
  seed: string;
}

export interface TaskResultMsg extends ClientMessage {
  type: MessageType.TaskResult;
  taskId: string;
  pointsInside: number;
  totalSamples: number;
}

export interface TaskFailureMsg extends ClientMessage {
  type: MessageType.TaskFailure;
  taskId: string;
  errorMessage: string;
}

export interface SumRangeAssignMsg extends ClientMessage {
  type: MessageType.TaskAssign;
  taskId: string;
  senderId: string;
  receiverId: string;
  taskType: "SUM_RANGE";
  input: { start: number; end: number };
}

export interface SumRangeResultMsg extends ClientMessage {
  type: MessageType.TaskResult;
  taskId: string;
  senderId: string;
  receiverId: string;
  result: number;
}

export interface SumRangeFailureMsg extends ClientMessage {
  type: MessageType.TaskFailure;
  taskId: string;
  senderId: string;
  receiverId: string;
  error: string;
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
  | RegistrationSuccessMsg
  | WorkerDiscoveryRequestMsg
  | WorkerDiscoveryResponseMsg
  | WebrtcOfferMsg
  | WebrtcAnswerMsg
  | WebrtcIceCandidateMsg
  | TaskAssignMsg
  | TaskResultMsg
  | TaskFailureMsg
  | TaskProgressMsg
  | TestMsg
  | AckMsg
  | ErrorMsg
  | DisconnectMsg;

// Type guards

export function isCoordinatorRegisterMsg(msg: BaseMessage): msg is CoordinatorRegisterMsg {
  return msg.type === MessageType.CoordinatorRegister;
}

export function isWorkerRegisterMsg(msg: BaseMessage): msg is WorkerRegisterMsg {
  return msg.type === MessageType.WorkerRegister;
}

export function isRegistrationSuccessMsg(
  msg: BaseMessage
): msg is RegistrationSuccessMsg {
  return msg.type === MessageType.RegistrationSuccess;
}

export function isWorkerDiscoveryRequestMsg(
  msg: BaseMessage
): msg is WorkerDiscoveryRequestMsg {
  return msg.type === MessageType.WorkerDiscoveryRequest;
}

export function isWorkerDiscoveryResponseMsg(
  msg: BaseMessage
): msg is WorkerDiscoveryResponseMsg {
  return msg.type === MessageType.WorkerDiscoveryResponse;
}

export function isWebrtcOfferMsg(msg: BaseMessage): msg is WebrtcOfferMsg {
  return msg.type === MessageType.WebrtcOffer;
}

export function isWebrtcAnswerMsg(msg: BaseMessage): msg is WebrtcAnswerMsg {
  return msg.type === MessageType.WebrtcAnswer;
}

export function isWebrtcIceCandidateMsg(msg: BaseMessage): msg is WebrtcIceCandidateMsg {
  return msg.type === MessageType.WebrtcIceCandidate;
}

export function isTaskAssignMsg(msg: BaseMessage): msg is TaskAssignMsg {
  return msg.type === MessageType.TaskAssign;
}

export function isTaskResultMsg(msg: BaseMessage): msg is TaskResultMsg {
  return msg.type === MessageType.TaskResult;
}

export function isTaskProgressMsg(msg: BaseMessage): msg is TaskProgressMsg {
  return msg.type === MessageType.TaskProgress;
}

export function isTaskFailureMsg(msg: BaseMessage): msg is TaskFailureMsg {
  return msg.type === MessageType.TaskFailure;
}

export function isSumRangeAssignMsg(msg: BaseMessage): msg is SumRangeAssignMsg {
  return msg.type === MessageType.TaskAssign && (msg as any).taskType === "SUM_RANGE";
}

export function isSumRangeResultMsg(msg: BaseMessage): msg is SumRangeResultMsg {
  return msg.type === MessageType.TaskResult && (msg as any).taskType === "SUM_RANGE";
}

export function isSumRangeFailureMsg(msg: BaseMessage): msg is SumRangeFailureMsg {
  return msg.type === MessageType.TaskFailure && (msg as any).taskType === "SUM_RANGE";
}

export function isErrorMsg(msg: BaseMessage): msg is ErrorMsg {
  return msg.type === MessageType.Error;
}

export function isDisconnectMsg(msg: BaseMessage): msg is DisconnectMsg {
  return msg.type === MessageType.Disconnect;
}

export function isAckMsg(msg: BaseMessage): msg is AckMsg {
  return msg.type === MessageType.Ack;
}

export function isTestMsg(msg: BaseMessage): msg is TestMsg {
  return msg.type === MessageType.Test;
}

// --- Test and acknowledgement messages ---

export interface TestMsg extends ClientMessage {
  type: MessageType.Test;
  messageId: string; // UUID identifying this specific message
  payload: unknown;
}

export interface AckMsg extends BaseMessage {
  type: MessageType.Ack;
  messageId: string; // The messageId being acknowledged
}
