/**
 * bridge/events.ts
 *
 * Single point of contact with the Wails runtime event bus.
 * All other modules import from here instead of from the generated
 * `wailsjs/runtime/runtime` path directly.
 */
export {
  EventsOn,
  EventsOff,
  EventsEmit,
} from '../../wailsjs/runtime/runtime';
