import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { getOsAsync } from "@blazetrails/activesupport";
import { betterSqlite3Driver } from "../sqlite/better-sqlite3.js";
import { RUN_TOKEN_ENV, STALE_DB_AGE_MS } from "./run-token.js";
import { activeLane } from "./connection.js";

export { RUN_TOKEN_ENV };

const DB_FILE_SUFFIXES = ["", "-wal", "-shm"] as const;

export function unlinkDbFiles(base: string): void {
  for (const suffix of DB_FILE_SUFFIXES) {
    try {
      File.delete(base + suffix);
    } catch {}
  }
}

const cleanupG = globalThis as typeof globalThis & { __arDbCleanupPaths?: Set<string> };

export async function registerDbFileCleanupOnExit(base: string): Promise<void> {
  const registered = (cleanupG.__arDbCleanupPaths ??= new Set<string>());
  if (registered.has(base)) return;
  registered.add(base);
  try {
    process.on("exit", () => unlinkDbFiles(base));
  } catch (error) {
    registered.delete(base);
    throw error;
  }
}

export const TEMP_DB_PREFIX = "ar-test-";

async function tempDbEntries(): Promise<string[]> {
  try {
    return Dir.children(await tmpRoot()).filter((name) => name.startsWith(TEMP_DB_PREFIX));
  } catch {
    return [];
  }
}

function unlinkQuietly(target: string): void {
  try {
    File.delete(target);
  } catch {}
}

export async function sweepRunDbFiles(runToken: string): Promise<void> {
  const root = await tmpRoot();
  const stamp = `-${runToken}`;
  for (const name of (await tempDbEntries()).filter((name) => name.includes(stamp))) {
    unlinkQuietly(File.join(root, name));
  }
}

export async function sweepStaleDbFiles(): Promise<void> {
  const root = await tmpRoot();
  const cutoff = Date.now() - STALE_DB_AGE_MS;
  for (const name of await tempDbEntries()) {
    const target = File.join(root, name);
    try {
      if (File.mtime(target).getTime() >= cutoff) continue;
    } catch {
      continue;
    }
    unlinkQuietly(target);
  }
}

export const TEMPLATE_PATH_ENV = "AR_TEST_TEMPLATE_PATH";
export const WORKER_DB_ENV = "AR_TEST_WORKER_DB";

export function isSqliteRun(): boolean {
  return activeLane() === "sqlite";
}

async function tmpRoot(): Promise<string> {
  return (await getOsAsync()).tmpdir();
}

export async function templatePathFor(runToken: string): Promise<string> {
  return File.join(await tmpRoot(), `ar-test-template-${runToken}.sqlite`);
}

const g = globalThis as typeof globalThis & { __arWorkerDbPath?: string };

export async function ensureWorkerClone(): Promise<string | null> {
  if (g.__arWorkerDbPath) return g.__arWorkerDbPath;

  const template = process.env[TEMPLATE_PATH_ENV];
  if (!template || !isSqliteRun()) return null;

  const runToken = process.env[RUN_TOKEN_ENV] ?? "x";
  const slot = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? "1";
  const dest = File.join(await tmpRoot(), `ar-test-worker-${runToken}-${slot}.sqlite`);

  if (!File.isExist(dest)) {
    const driver = betterSqlite3Driver;
    if (driver.restoreFromPath) {
      await driver.restoreFromPath(template, dest);
    } else {
      FileUtils.cp(template, dest);
    }
  }
  await registerDbFileCleanupOnExit(dest);

  g.__arWorkerDbPath = dest;
  return dest;
}
