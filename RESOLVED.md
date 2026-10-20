# Issue Resolved: Unable to type messages after registration

## Problem
Users were unable to type anything into the message input field after registering. The input was disabled because `dataChannelState` remained `"---"` since the WebRTC connection was never automatically established after registration.

## Root Cause
The `initiateConnection` function was defined at line 233 of `App.tsx` but was never called after successful registration. This kept `dataChannelState` as `"---"`, and the message input remained disabled by the condition:
```
disabled={dataChannelState !== "open" || !isRegistered || !role}
```

## Solution
Modified `handleSignalingMessage` in `frontend/src/App.tsx` to automatically initiate WebRTC connection after successful registration:

- **Coordinators**: Automatically initiate connection to worker "worker-1" (or request worker list first if not yet discovered)
- **Workers**: Set connection state to "waiting for coordinator" (since coordinators initiate)

## Files Changed
1. `frontend/src/App.tsx` - Added automatic WebRTC connection initiation (30 lines added)

## Verification
- All 142 tests pass
- All 3 packages build successfully
- Message input now enables after registration