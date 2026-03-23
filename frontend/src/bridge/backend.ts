/**
 * bridge/backend.ts
 *
 * Single point of contact with the Wails-generated bindings for the Go
 * `api.App` struct.  All other modules import from here instead of from
 * the generated `wailsjs/go/…` paths directly.
 */
export {
  DetectShells,
  NewSession,
  CloseSession,
  Write,
  Resize,
} from '../../wailsjs/go/api/App';
