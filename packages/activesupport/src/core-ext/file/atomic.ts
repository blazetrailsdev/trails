import { getFs, getPath, type FsStatResult } from "../../fs-adapter.js";

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

  const oldStat = getFs().existsSync(fileName)
    ? // Get original file permissions
      getFs().statSync(fileName)
    : // If not possible, probe which are the default permissions in the
      // destination directory.
      probeStatIn(getPath().dirname(fileName));

  if (oldStat) {
    // Set correct permissions on new file
    try {
      if (oldStat.uid != null && oldStat.gid != null) {
        getFs().chownSync?.(tempPath, oldStat.uid, oldStat.gid);
      }
      // This operation will affect filesystem ACL's
      if (oldStat.mode != null) getFs().chmodSync?.(tempPath, oldStat.mode);
    } catch (error) {
      // Changing file ownership failed, moving on.
      const code = (error as { code?: string }).code;
      if (code !== "EPERM" && code !== "EACCES") throw error;
    }
  }

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

/**
 * Private utility method.
 *
 * Mirrors Ruby `File.probe_stat_in` (core_ext/file/atomic.rb:55-70).
 *
 * The basename keeps Rails' three uniqueness components after the prefix
 * (atomic.rb:57-62). The third is Rails' own `rand(1000000)`; the first two
 * stand in for `Thread.current.object_id` and `Process.pid`, neither of which
 * exists here (single thread, no `process.*`).
 */
export function probeStatIn(dir: string): FsStatResult | null {
  const basename = [
    ".permissions_check",
    Math.floor(Math.random() * 1000000),
    Math.floor(Math.random() * 1000000),
    Math.floor(Math.random() * 1000000),
  ].join(".");

  let fileName: string | null = getPath().join(dir, basename);
  try {
    getFs().appendFileSync(fileName, "");
    return getFs().statSync(fileName);
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
    fileName = null;
    return null;
  } finally {
    if (fileName) {
      try {
        getFs().unlinkSync(fileName);
      } catch {}
    }
  }
}
