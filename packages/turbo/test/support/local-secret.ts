export default async function setup(): Promise<void> {
  const { File, FileUtils, SecureRandom } = await import("@blazetrails/ruby-compat");
  const keyFile = File.expandPath("../dummy/tmp/local_secret.txt", import.meta.dirname);
  if (await File.isExistAsync(keyFile)) return;

  await FileUtils.mkdirPAsync(File.dirname(keyFile));
  await File.writeAsync(keyFile, SecureRandom.hex(64));
}
