import type { PaneLeaf, PaneNode, Tab } from '../domain/types';

export interface WorkspaceApi {
  /** Gets all leaves from the active tab */
  getLeaves(): PaneLeaf[];
  
  /** Gets the active tab */
  getActiveTab(): Tab | undefined;
  
  /** Gets the currently focused leaf ID */
  getActiveLeafId(): string;
  
  /** Sets the currently focused leaf ID */
  setActiveLeafId(id: string): void;
  
  /** Re-renders the workspace explicitly */
  renderWorkspace(): void;
  
  /** Replaces a leaf in the current tab tree */
  replaceLeaf(leafId: string, newLeaf: PaneNode): void;
  
  /** Removes a leaf asynchronously from the tree */
  removeLeaf(leafId: string): Promise<void>;
}

let api: WorkspaceApi | null = null;

export function setWorkspaceApi(impl: WorkspaceApi) {
  api = impl;
}

export function getWorkspaceApi(): WorkspaceApi {
  if (!api) throw new Error('Workspace API not initialized');
  return api;
}
