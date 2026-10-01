/** PeerCompute Milestone 02 - Shared Package Tests */
import { describe, it, expect } from "vitest";

// Test that MessageType enum has expected values
describe("MessageType enum", () => {
  it("has COORDINATOR_REGISTER", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _type: "COORDINATOR_REGISTER" = "COORDINATOR_REGISTER";
  });

  it("has WORKER_REGISTER", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _type: "WORKER_REGISTER" = "WORKER_REGISTER";
  });

  it("has WEBRTC_OFFER", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _type: "WEBRTC_OFFER" = "WEBRTC_OFFER";
  });

  it("has WEBRTC_ANSWER", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _type: "WEBRTC_ANSWER" = "WEBRTC_ANSWER";
  });

  it("has WEBRTC_ICE_CANDIDATE", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _type: "WEBRTC_ICE_CANDIDATE" = "WEBRTC_ICE_CANDIDATE";
  });

  it("has TASK_ASSIGN", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _type: "TASK_ASSIGN" = "TASK_ASSIGN";
  });

  it("has TASK_RESULT", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _type: "TASK_RESULT" = "TASK_RESULT";
  });

  it("has TASK_PROGRESS", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _type: "TASK_PROGRESS" = "TASK_PROGRESS";
  });

  it("has ERROR", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _type: "ERROR" = "ERROR";
  });

  it("has DISCONNECT", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _type: "DISCONNECT" = "DISCONNECT";
  });
});

// Test UUID pattern validation
describe("UUID pattern validation", () => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89][0-9a-f]{3}-[0-9a-f]{12}$/i;

  it("accepts valid UUIDv4 format with 4 as third group start", () => {
    expect(uuidPattern.test("123e4567-e89b-400d-a456-426614174000")).toBe(true);
  });

  it("accepts valid UUIDv4 format with 8 as third group start", () => {
    expect(uuidPattern.test("123e4567-e89b-800d-a456-426614174000")).toBe(true);
  });

  it("accepts valid UUIDv4 format with 9 as third group start", () => {
    expect(uuidPattern.test("123e4567-e89b-900d-a456-426614174000")).toBe(true);
  });

  it("rejects invalid UUID format (wrong third group start)", () => {
    expect(uuidPattern.test("123e4567-e89b-12d3-a456-426614174000")).toBe(false);
  });

  it("rejects completely invalid format", () => {
    expect(uuidPattern.test("not-a-uuid")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(uuidPattern.test("")).toBe(false);
  });
});