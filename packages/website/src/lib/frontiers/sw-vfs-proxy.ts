/**
 * Async VFS proxy backed by the sandbox service worker.
 * Components use this for sandboxed file operations when SQLite lives
 * in the service worker. Mirrors the VirtualFS operations needed by
 * the sandbox, but is not a drop-in replacement for the sync VirtualFS API.
 */

import type { VfsFile } from "./virtual-fs.js";
import type { SwClient } from "./sw-client.js";
import type { SwBroadcast } from "./sw-protocol.js";

export class SwVfsProxy {
  private _listeners: Array<() => void> = [];
  private _unsubBroadcast: (() => void) | null = null;

  constructor(private client: SwClient) {
    this._unsubBroadcast = client.onBroadcast((msg: SwBroadcast) => {
      if (msg.type === "vfs:changed") {
        for (const fn of this._listeners) fn();
      }
    });
  }

  async list(): Promise<VfsFile[]> {
    const resp = await this.client.send({ type: "vfs:list" });
    return resp.files;
  }

  async read(path: string): Promise<VfsFile | null> {
    const resp = await this.client.send({ type: "vfs:read", path });
    return resp.file;
  }

  async write(path: string, content: string, language?: string): Promise<void> {
    await this.client.send({ type: "vfs:write", path, content, language });
  }

  async delete(path: string): Promise<boolean> {
    const resp = await this.client.send({ type: "vfs:delete", path });
    return resp.deleted;
  }

  async rename(oldPath: string, newPath: string): Promise<boolean> {
    const resp = await this.client.send({ type: "vfs:rename", oldPath, newPath });
    return resp.renamed;
  }

  async exists(path: string): Promise<boolean> {
    const resp = await this.client.send({ type: "vfs:exists", path });
    return resp.exists;
  }

  onChange(fn: () => void): () => void {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== fn);
    };
  }

  dispose(): void {
    this._unsubBroadcast?.();
    this._listeners = [];
  }
}
