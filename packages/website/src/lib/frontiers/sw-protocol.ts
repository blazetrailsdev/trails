/**
 * Shared message types for the sandbox service worker protocol.
 * Used by both sw-client.ts (main thread) and sandbox-sw.js (worker).
 */

import type { VfsFile } from "./virtual-fs.js";
import type { CliResult } from "./trail-cli.js";

// ── Request → Response mapping ──────────────────────────────────────────
// Each request type maps to exactly one response shape. SwClient.send()
// uses this to infer the return type from the request, so callers get
// type-safe responses without manual generic parameters.

export interface SwMessageMap {
  init: { type: "init"; ready: true };
  "vfs:list": { type: "vfs:list"; files: VfsFile[] };
  "vfs:read": { type: "vfs:read"; file: VfsFile | null };
  "vfs:write": { type: "vfs:write"; ok: true };
  "vfs:delete": { type: "vfs:delete"; deleted: boolean };
  "vfs:rename": { type: "vfs:rename"; renamed: boolean };
  "vfs:exists": { type: "vfs:exists"; exists: boolean };
  "db:tables": { type: "db:tables"; tables: string[] };
  "db:columns": {
    type: "db:columns";
    columns: Array<{ name: string; type: string; notnull: boolean; pk: boolean }>;
  };
  "db:query": { type: "db:query"; results: Array<{ columns: string[]; values: unknown[][] }> };
  exec: { type: "exec"; result: CliResult };
  "db:export": { type: "db:export"; data: Uint8Array };
  "db:import": { type: "db:import"; ok: true };
}

// ── Request messages (main → SW) ────────────────────────────────────────

export type SwRequest =
  | { type: "init" }
  | { type: "vfs:list" }
  | { type: "vfs:read"; path: string }
  | { type: "vfs:write"; path: string; content: string; language?: string }
  | { type: "vfs:delete"; path: string }
  | { type: "vfs:rename"; oldPath: string; newPath: string }
  | { type: "vfs:exists"; path: string }
  | { type: "db:tables" }
  | { type: "db:columns"; table: string }
  | { type: "db:query"; sql: string }
  | { type: "exec"; command: string }
  | { type: "db:export" }
  | { type: "db:import"; data: Uint8Array };

// ── Response messages (SW → main) ───────────────────────────────────────

export type SwResponse = SwMessageMap[keyof SwMessageMap] | { type: "error"; message: string };

// ── Broadcast messages (SW → all clients) ───────────────────────────────

export type SwBroadcast = { type: "vfs:changed" } | { type: "db:changed" };
