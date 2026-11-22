import { Dir, File, FileUtils, Process } from "@blazetrails/ruby-compat";

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
