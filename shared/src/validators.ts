/**
 * Runtime message validation for PeerCompute protocol.
 * Validates untrusted input at runtime, including required fields,
 * discriminator values, and basic field formats.
 * Malformed messages produce a validation failure rather than crash.
 */

import {
  MessageType,
  BaseMessage,
  BaseMessageFields,
  ClientMessage,
  CoordinatorRegisterMsg,
  WorkerRegisterMsg,
  WorkerDiscoveryRequestMsg,
  TestMsg,
  AckMsg,
  SumRangeAssignMsg,
  SumRangeResultMsg,
  SumRangeFailureMsg,
} from "./messages";

function isValidUuid(uuid: string): boolean {
  /* FIX: Updated UUID pattern to accept valid UUID versions (4, 8, 9) 
     and variant bits (8, 9, A, B) per RFC 4122 */ 
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[489][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(uuid);
}

function isValidTimestamp(ts: unknown): ts is number {
  return typeof ts === "number" && Number.isFinite(ts) && ts >= 0;
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === "string" && val.length > 0;
}

function isNonNegativeNumber(val: unknown): val is number {
  return typeof val === "number" && Number.isFinite(val) && val >= 0;
}

function isValidDisconnectReason(val: unknown): val is "normal" | "timeout" | "error" {
  return typeof val === "string" && (val === "normal" || val === "timeout" || val === "error");
}

/**
 * Validates a base message has required fields and a valid type discriminator.
 * Returns true if the message has a non-empty type string and a valid timestamp.
 */
export function validateBaseMessage(msg: unknown): msg is BaseMessageFields {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return isNonEmptyString(m.type) && isValidTimestamp(m.timestamp);
};

/**
 * Validates a full client message has type, timestamp, and clientId.
 * clientId must be a UUID-format string.
 * Returns true if the message passes all base + clientId checks.
 */
export function validateClientMessage(msg: unknown): msg is ClientMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (!validateBaseMessage(msg)) return false;
  if (!isNonEmptyString(m.clientId)) return false;
  if (!isValidUuid(m.clientId)) return false;
  return true;
};

/**
 * Validates a registration message.
 * Checks type discriminator, clientId (UUID), role, and role-specific fields.
 */
export function validateRegistrationMsg(msg: unknown): msg is (
  CoordinatorRegisterMsg | WorkerRegisterMsg
) {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (!validateClientMessage(msg)) return false;
  const type = m.type as string;
  if (type !== MessageType.CoordinatorRegister && type !== MessageType.WorkerRegister) {
    return false;
  }
  if (typeof m.role !== "string") return false;
  if (type === MessageType.WorkerRegister) {
    if (!Array.isArray(m.capabilities)) return false;
    for (const cap of m.capabilities) {
      if (!isNonEmptyString(cap)) return false;
    }
  }
  return true;
}

/**
 * Validates a discovery request message.
 * The type must be WORKER_DISCOVERY_REQUEST and the message must include
 * a valid UUID clientId (inherited from validateClientMessage).
 */
export function validateDiscoveryRequestMsg(
  msg: unknown
): msg is WorkerDiscoveryRequestMsg {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (!validateClientMessage(msg)) return false;
  return m.type === MessageType.WorkerDiscoveryRequest;
}

/**
 * Validates a test message.
 * Checks type discriminator, clientId (UUID), messageId (UUID), timestamp, and payload.
 */
export function validateTestMsg(msg: unknown): msg is TestMsg {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (!validateClientMessage(msg)) return false;
  if (!isNonEmptyString(m.messageId)) return false;
  if (!isValidUuid(m.messageId)) return false;
  return true;
}

/**
 * Validates an acknowledgement message.
 * Checks type discriminator, messageId (UUID), and timestamp.
 */
export function validateAckMsg(msg: unknown): msg is AckMsg {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (!validateBaseMessage(msg)) return false;
  if (!isNonEmptyString(m.messageId)) return false;
  if (!isValidUuid(m.messageId)) return false;
  return true;
}

/**\n * Validates a SUM_RANGE assign message.\n * Checks type discriminator, clientId (UUID), taskId, taskType, and input fields.\n */
export function validateSumRangeAssignMsg(msg: unknown): msg is SumRangeAssignMsg {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (!validateClientMessage(msg)) return false;
  if (m.taskType !== "SUM_RANGE") return false;
  if (typeof m.taskId !== "string" || m.taskId.length === 0) return false;
  if (typeof m.input !== "object" || m.input === null) return false;
  const input = m.input as Record<string, unknown>;
  if (typeof input.start !== "number" || !Number.isFinite(input.start)) return false;
  if (typeof input.end !== "number" || !Number.isFinite(input.end)) return false;
  return true;
}

/**\n * Validates a SUM_RANGE result message.\n * Checks type discriminator, clientId (UUID), taskId, and result field.\n */
export function validateSumRangeResultMsg(msg: unknown): msg is SumRangeResultMsg {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (!validateClientMessage(msg)) return false;
  if (typeof m.taskId !== "string" || m.taskId.length === 0) return false;
  if (typeof m.result !== "number" || !Number.isFinite(m.result)) return false;
  return true;
}

/**\n * Validates a SUM_RANGE failure message.\n * Checks type discriminator, clientId (UUID), taskId, and error message.\n */
export function validateSumRangeFailureMsg(msg: unknown): msg is SumRangeFailureMsg {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (!validateClientMessage(msg)) return false;
  if (typeof m.taskId !== "string" || m.taskId.length === 0) return false;
  if (typeof m.error !== "string" || m.error.length === 0) return false;
  return true;
}
