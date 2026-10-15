/**
 * Protocol message shapes for PeerCompute.
 * Defines typed message shapes for the protocol categories required by the approved plan.
 * Uses a consistent `type` discriminator and defines sender/recipient identity fields where appropriate.
 * Distinguishes client-originated messages from server-originated messages where their shapes differ.
 * A client-generated UUID is an identifier, not authentication - clientId is not required on every message.
 */
// --- Message type discriminator ---
export var MessageType;
(function (MessageType) {
    // Registration messages
    MessageType["CoordinatorRegister"] = "COORDINATOR_REGISTER";
    MessageType["WorkerRegister"] = "WORKER_REGISTER";
    MessageType["RegistrationSuccess"] = "REGISTRATION_SUCCESS";
    // Discovery messages (Milestone 05)
    MessageType["WorkerDiscoveryRequest"] = "WORKER_DISCOVERY_REQUEST";
    MessageType["WorkerDiscoveryResponse"] = "WORKER_DISCOVERY_RESPONSE";
    // WebRTC signaling messages
    MessageType["WebrtcOffer"] = "WEBRTC_OFFER";
    MessageType["WebrtcAnswer"] = "WEBRTC_ANSWER";
    MessageType["WebrtcIceCandidate"] = "WEBRTC_ICE_CANDIDATE";
    // Task messages
    MessageType["TaskAssign"] = "TASK_ASSIGN";
    MessageType["TaskResult"] = "TASK_RESULT";
    MessageType["TaskProgress"] = "TASK_PROGRESS";
    // Error and control messages
    MessageType["Error"] = "ERROR";
    MessageType["Disconnect"] = "DISCONNECT";
})(MessageType || (MessageType = {}));
// Type guards
export function isCoordinatorRegisterMsg(msg) {
    return msg.type === MessageType.CoordinatorRegister;
}
export function isWorkerRegisterMsg(msg) {
    return msg.type === MessageType.WorkerRegister;
}
export function isRegistrationSuccessMsg(msg) {
    return msg.type === MessageType.RegistrationSuccess;
}
export function isWorkerDiscoveryRequestMsg(msg) {
    return msg.type === MessageType.WorkerDiscoveryRequest;
}
export function isWorkerDiscoveryResponseMsg(msg) {
    return msg.type === MessageType.WorkerDiscoveryResponse;
}
export function isWebrtcOfferMsg(msg) {
    return msg.type === MessageType.WebrtcOffer;
}
export function isWebrtcAnswerMsg(msg) {
    return msg.type === MessageType.WebrtcAnswer;
}
export function isWebrtcIceCandidateMsg(msg) {
    return msg.type === MessageType.WebrtcIceCandidate;
}
export function isTaskAssignMsg(msg) {
    return msg.type === MessageType.TaskAssign;
}
export function isTaskResultMsg(msg) {
    return msg.type === MessageType.TaskResult;
}
export function isTaskProgressMsg(msg) {
    return msg.type === MessageType.TaskProgress;
}
export function isErrorMsg(msg) {
    return msg.type === MessageType.Error;
}
export function isDisconnectMsg(msg) {
    return msg.type === MessageType.Disconnect;
}
