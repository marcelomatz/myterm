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

// ForceQuit is a newly bound Go method. We call it via the Wails global so
// we don't depend on the generated .d.ts (which only appears after the first
// compile that includes the new method).
export function ForceQuit(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).go.api.App.ForceQuit();
}

