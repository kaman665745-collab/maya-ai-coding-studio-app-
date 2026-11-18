import { EventEmitter } from 'node:events';

export interface StudioEventPayload {
  id: string;
  ownerUid: string;
  projectId?: number;
  type:
    | 'agent:status'
    | 'proposal:created'
    | 'proposal:updated'
    | 'build:log'
    | 'build:finished'
    | 'test:finished'
    | 'preview:status'
    | 'checkpoint:created'
    | 'review:finished';
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

class StudioEventBus extends EventEmitter {
  emitStudioEvent(event: Omit<StudioEventPayload, 'id' | 'timestamp'>) {
    const full: StudioEventPayload = {
      ...event,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
    };
    this.emit(`tenant:${event.ownerUid}`, full);
    return full;
  }
}

export const studioEventBus = new StudioEventBus();
studioEventBus.setMaxListeners(100);
