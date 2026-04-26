/**
 * Sync VirtualFS-compatible wrapper over the async SwVfsProxy.
 * Maintains a local cache so FileTree and other components can use their
 * existing sync VirtualFS API without modification.
 */

import type { VfsFile } from "./virtual-fs.js";
import type { SwVfsProxy } from "./sw-vfs-proxy.js";

export class SyncSwVfs {
  private _cache = new Map<string, VfsFile>();
  private _listeners: Array<() => void> = [];
  private _unsubProxy: (() => void) | null = null;

  constructor(private proxy: SwVfsProxy) {
    this._unsubProxy = proxy.onChange(() => {
      void this._rehydrate().catch(() => {});
    });
  }

  async hydrate(): Promise<void> {
    const files = await this.proxy.list();
    this._cache.clear();
    for (const f of files) {
      this._cache.set(f.path, f);
    }
    this._notify();
  }

  private async _rehydrate(): Promise<void> {
    const files = await this.proxy.list();
    this._cache.clear();
    for (const f of files) {
      this._cache.set(f.path, f);
    }
    this._notify();
  }

  private _notify(): void {
    for (const fn of this._listeners) fn();
  }

  list(): VfsFile[] {
    return [...this._cache.values()];
  }

  read(path: string): VfsFile | null {
    return this._cache.get(path) ?? null;
  }

  exists(path: string): boolean {
    return this._cache.has(path);
  }

  write(path: string, content: string, language?: string): void {
    const now = new Date().toISOString();
    const existing = this._cache.get(path);
    this._cache.set(path, {
      path,
      content,
      language: language ?? existing?.language ?? "typescript",
      created_at: existing?.created_at ?? now,
      updated_at: now,
    });
    this._notify();
    void this.proxy.write(path, content, language);
  }

  delete(path: string): boolean {
    const had = this._cache.delete(path);
    if (had) {
      this._notify();
      void this.proxy.delete(path);
    }
    return had;
  }

  rename(oldPath: string, newPath: string): boolean {
    const file = this._cache.get(oldPath);
    if (!file) return false;
    this._cache.delete(oldPath);
    this._cache.set(newPath, { ...file, path: newPath, updated_at: new Date().toISOString() });
    this._notify();
    void this.proxy.rename(oldPath, newPath);
    return true;
  }

  onChange(fn: () => void): () => void {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== fn);
    };
  }

  clear(): void {
    // no-op in sandbox context
  }

  seedDefaults(): void {
    // no-op in sandbox context
  }

  dispose(): void {
    this._unsubProxy?.();
    this._listeners = [];
  }
}
