import { File, FileUtils } from "@blazetrails/ruby-compat";

export default async function setup(): Promise<void> {
  const keyFile = File.expandPath("../dummy/tmp/local_secret.txt", import.meta.dirname);
  if (await File.isExistAsync(keyFile)) return;

  const bytes = crypto.getRandomValues(new Uint8Array(64));
  await FileUtils.mkdirPAsync(File.dirname(keyFile));
  await File.writeAsync(
    keyFile,
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""),
  );
}
