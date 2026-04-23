import type { Component } from 'svelte';
import type { PaneLeaf } from '../domain/types';

export interface PaneExtension {
  id: string;
  component: Component<any>;
}

export interface SidebarExtension {
  id: string;
  title: string;
  icon?: Component;
  component: Component<any>;
  order: number;
}

class ExtensionRegistry {
  private panes = new Map<string, PaneExtension>();
  private sidebarViews = new Map<string, SidebarExtension>();
  public isEnterpriseMode = false;

  registerPane(ext: PaneExtension) {
    this.panes.set(ext.id, ext);
  }

  getPane(id: string): PaneExtension | undefined {
    return this.panes.get(id);
  }

  registerSidebarView(ext: SidebarExtension) {
    this.sidebarViews.set(ext.id, ext);
  }

  getSidebarViews(): SidebarExtension[] {
    return Array.from(this.sidebarViews.values()).sort((a, b) => a.order - b.order);
  }
}

export const extensionRegistry = new ExtensionRegistry();
