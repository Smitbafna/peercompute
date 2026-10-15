/**
 * Runtime message validation for PeerCompute protocol.
 * Validates untrusted input at runtime, including required fields,
 * discriminator values, and basic field formats.
 * Malformed messages produce a validation failure rather than crash.
 */
import { MessageType, } from "./messages";
function isValidUuid(uuid) {
    /* FIX: Updated UUID pattern to accept valid UUID versions (4, 8, 9)
       and variant bits (8, 9, A, B) per RFC 4122 */
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[489][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidPattern.test(uuid);
}
function isValidTimestamp(ts) {
    return typeof ts === "number" && Number.isFinite(ts) && ts >= 0;
}
function isNonEmptyString(val) {
    return typeof val === "string" && val.length > 0;
}
function isNonNegativeNumber(val) {
    return typeof val === "number" && Number.isFinite(val) && val >= 0;
}
function isValidDisconnectReason(val) {
    return typeof val === "string" && (val === "normal" || val === "timeout" || val === "error");
}
/**
 * Validates a base message has required fields and a valid type discriminator.
 * Returns true if the message has a non-empty type string and a valid timestamp.
 */
export function validateBaseMessage(msg) {
    if (typeof msg !== "object" || msg === null)
        return false;
    const m = msg;
    return isNonEmptyString(m.type) && isValidTimestamp(m.timestamp);
}
;
/**
 * Validates a full client message has type, timestamp, and clientId.
 * clientId must be a UUID-format string.
 * Returns true if the message passes all base + clientId checks.
 */
export function validateClientMessage(msg) {
    if (typeof msg !== "object" || msg === null)
        return false;
    const m = msg;
    if (!validateBaseMessage(msg))
        return false;
    if (!isNonEmptyString(m.clientId))
        return false;
    if (!isValidUuid(m.clientId))
        return false;
    return true;
}
;
/**
 * Validates a registration message.
 * Checks type discriminator, clientId (UUID), role, and role-specific fields.
 */
export function validateRegistrationMsg(msg) {
    if (typeof msg !== "object" || msg === null)
        return false;
    const m = msg;
    if (!validateClientMessage(msg))
        return false;
    const type = m.type;
    if (type !== MessageType.CoordinatorRegister && type !== MessageType.WorkerRegister) {
        return false;
    }
    if (typeof m.role !== "string")
        return false;
    if (type === MessageType.WorkerRegister) {
        if (!Array.isArray(m.capabilities))
            return false;
        for (const cap of m.capabilities) {
            if (!isNonEmptyString(cap))
                return false;
        }
    }
    return true;
}
/**
 * Validates a discovery request message.
 * The type must be WORKER_DISCOVERY_REQUEST and the message must include
 * a valid UUID clientId (inherited from validateClientMessage).
 */
export function validateDiscoveryRequestMsg(msg) {
    if (typeof msg !== "object" || msg === null)
        return false;
    const m = msg;
    if (!validateClientMessage(msg))
        return false;
    return m.type === MessageType.WorkerDiscoveryRequest;
}
