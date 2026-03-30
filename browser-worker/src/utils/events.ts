import { EventEmitter } from 'events';

export const globalEvents = new EventEmitter();

// For real-time web UI dashboard logs
export function broadcastLog(level: string, message: string, meta: any = {}) {
  globalEvents.emit('dashboard-log', {
    time: Date.now(),
    level: level === 'error' ? 50 : level === 'warn' ? 40 : 30, // standard pino log levels
    msg: message,
    ...meta,
  });
}
