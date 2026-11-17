import { File, FileUtils, SecureRandom } from "@blazetrails/ruby-compat";

export default async function setup(): Promise<void> {
  const keyFile = File.expandPath("../dummy/tmp/local_secret.txt", import.meta.dirname);
  if (await File.isExistAsync(keyFile)) return;

  await FileUtils.mkdirPAsync(File.dirname(keyFile));
  await File.writeAsync(keyFile, SecureRandom.hex(64));
}
