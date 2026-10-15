import { WebSocket as Ws } from 'ws';

declare module 'ws' {
  interface WebSocket {
    isAlive: boolean;
  }
}
