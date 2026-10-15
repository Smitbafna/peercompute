/**
 * Runtime message validation for PeerCompute protocol.
 * Validates untrusted input at runtime, including required fields,
 * discriminator values, and basic field formats.
 * Malformed messages produce a validation failure rather than crash.
 */
import { BaseMessageFields, ClientMessage, CoordinatorRegisterMsg, WorkerRegisterMsg, WorkerDiscoveryRequestMsg } from "./messages";
/**
 * Validates a base message has required fields and a valid type discriminator.
 * Returns true if the message has a non-empty type string and a valid timestamp.
 */
export declare function validateBaseMessage(msg: unknown): msg is BaseMessageFields;
/**
 * Validates a full client message has type, timestamp, and clientId.
 * clientId must be a UUID-format string.
 * Returns true if the message passes all base + clientId checks.
 */
export declare function validateClientMessage(msg: unknown): msg is ClientMessage;
/**
 * Validates a registration message.
 * Checks type discriminator, clientId (UUID), role, and role-specific fields.
 */
export declare function validateRegistrationMsg(msg: unknown): msg is (CoordinatorRegisterMsg | WorkerRegisterMsg);
/**
 * Validates a discovery request message.
 * The type must be WORKER_DISCOVERY_REQUEST and the message must include
 * a valid UUID clientId (inherited from validateClientMessage).
 */
export declare function validateDiscoveryRequestMsg(msg: unknown): msg is WorkerDiscoveryRequestMsg;
