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
} from '../../../wailsjs/go/wails/App';

export {
  AnalyzeDirectory,
  ListDirectory,
  ReadFile,
  WriteFile,
} from '@bindings/enterprise/FileService';

export {
  GetGitStatus,
} from '@bindings/enterprise/GitService';

// ForceQuit and CheckForUpdates are bound Go methods accessed via the Wails
// global so we don't depend on the generated .d.ts (only appears after the
// first compile that includes the new method).

export type { application, enterprise } from '../../../wailsjs/go/models';

export function ForceQuit(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).go.wails.App.ForceQuit();
}

export interface UpdateInfo {
  hasUpdate: boolean;
  version: string;
  url: string;
}

export function CheckForUpdates(): Promise<UpdateInfo> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).go.wails.App.CheckForUpdates();
}

export function GetOllamaModels(host: string): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).go.wails.App.GetOllamaModels(host);
}

export function GenerateOllamaResponse(host: string, model: string, prompt: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).go.wails.App.GenerateOllamaResponse(host, model, prompt);
}

