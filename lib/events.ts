import { EventEmitter } from 'events'

declare global {
  // eslint-disable-next-line no-var
  var __workspaceEvents: EventEmitter | undefined
}

if (!global.__workspaceEvents) {
  global.__workspaceEvents = new EventEmitter()
  global.__workspaceEvents.setMaxListeners(500)
}

export const workspaceEvents = global.__workspaceEvents!

export type WorkspaceEvent =
  | { type: 'tree_created'; tree: unknown }
  | { type: 'tree_updated'; tree: unknown }
  | { type: 'tree_deleted'; rootId: string }
  | { type: 'variant_forked'; rootId: string; variant: unknown; tree: unknown }
  | { type: 'variant_promoted'; rootId: string; mainId: string; tree: unknown }

export function broadcastWorkspace(event: WorkspaceEvent) {
  workspaceEvents.emit('update', event)
}
