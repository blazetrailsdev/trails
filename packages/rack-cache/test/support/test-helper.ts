import { env as ENV, Dir, File, FileUtils, Process, warn } from "@blazetrails/ruby-compat";
import type { Client } from "memjs";

let tempDirCount = 0;

export async function createTempDirectory(): Promise<string> {
  tempDirCount += 1;
  const path = File.join(Dir.tmpdir(), `rack-cache-${Process.pid}-${tempDirCount}`);
  await FileUtils.mkdirPAsync(path);
  return path;
}

export async function removeEntrySecure(path: string): Promise<void> {
  await FileUtils.rmRfAsync(path);
}

export const MEMCACHED: string = ENV["MEMCACHED"] || "localhost:11211";
export let dalli: Client | false | null = null;

export async function haveDalli(server: string = MEMCACHED): Promise<boolean> {
  if (dalli != null) return dalli !== false;
  try {
    const { Client } = await import("memjs");
    dalli = Client.create(server, { retries: 0 });
    await dalli.set("ping", "");
    return true;
  } catch {
    warn("dalli not working. related tests will be skipped.");
    if (dalli) dalli.quit();
    dalli = false;
    return false;
  }
}
