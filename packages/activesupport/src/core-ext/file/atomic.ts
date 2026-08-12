import { getFs, getPath } from "../../fs-adapter.js";

/**
 * Write to a file atomically. Useful for situations where you don't
 * want other processes or threads to see half-written files.
 *
 *     atomicWrite("important.file", undefined, (file) => {
 *       file.write("hello");
 *     });
 *
 * This method needs to create a temporary file. By default it will create it
 * in the same directory as the destination file. If you don't like this
 * behavior you can provide a different directory but it must be on the
 * same physical filesystem as the file you're trying to write.
 *
 *     atomicWrite("/data/something.important", "/data/tmp", (file) => {
 *       file.write("hello");
 *     });
 *
 * Mirrors Ruby `File.atomic_write` (core_ext/file/atomic.rb:20-52). The
 * yielded object stands in for the `Tempfile` the Ruby block writes to; only
 * `write` is used by callers, and `binmode`/`close` are the adapter's job.
 *
 * @missingRailsCall exist? — the fs adapter models no uid/gid/mode, so the
 * `exist?`/`probe_stat_in` permission probe (atomic.rb:28-34) has nothing to
 * probe and the `chown`/`chmod` copy is unrepresentable.
 * @missingRailsCall stat — same permission probe (atomic.rb:30).
 * @missingRailsCall rename — spelled `renameSync`, the fs adapter's name for
 * the sync rename every other trails caller uses (atomic.rb:48).
 */
export function atomicWrite<T>(
  fileName: string,
  tempDir: string | undefined,
  block: (tempFile: { write(payload: string): void }) => T,
): T {
  tempDir ??= getPath().dirname(fileName);

  const tempPath = getPath().join(
    tempDir,
    `.${getPath().basename(fileName)}.${Date.now().toString(36)}.${Math.floor(
      Math.random() * 1000000,
    ).toString(36)}`,
  );

  let payload = "";
  const tempFile = {
    write(chunk: string): void {
      payload += chunk;
    },
  };
  const returnVal = block(tempFile);
  getFs().writeFileSync(tempPath, payload, "utf-8");

  // Overwrite original file with temp file (atomic.rb:48).
  try {
    getFs().renameSync(tempPath, fileName);
  } catch (error) {
    try {
      getFs().unlinkSync(tempPath);
    } catch {}
    throw error;
  }
  return returnVal;
}
