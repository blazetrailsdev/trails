import { File, FileUtils, type FsStatResult } from "@blazetrails/ruby-compat";
import { Tempfile } from "../../tempfile.js";

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
 * Mirrors Ruby `File.atomic_write` (core_ext/file/atomic.rb:20-52).
 */
export function atomicWrite<T>(
  fileName: string,
  tempDir: string | undefined,
  block: (tempFile: Tempfile) => T,
): T {
  tempDir ??= File.dirname(fileName);

  return Tempfile.open(`.${File.basename(fileName)}`, tempDir, (tempFile) => {
    const returnVal = block(tempFile);
    tempFile.close();

    const oldStat = File.isExist(fileName)
      ? // Get original file permissions
        File.stat(fileName)
      : // If not possible, probe which are the default permissions in the
        // destination directory.
        probeStatIn(File.dirname(fileName));

    if (oldStat) {
      // Set correct permissions on new file
      try {
        if (oldStat.uid != null && oldStat.gid != null) {
          File.chown(oldStat.uid, oldStat.gid, tempFile.path!);
        }
        // This operation will affect filesystem ACL's
        if (oldStat.mode != null) File.chmod(oldStat.mode, tempFile.path!);
      } catch (error) {
        // Changing file ownership failed, moving on.
        const code = (error as { code?: string }).code;
        if (code !== "EPERM" && code !== "EACCES") throw error;
      }
    }

    // Overwrite original file with temp file
    File.rename(tempFile.path!, fileName);
    return returnVal;
  });
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

  let fileName: string | null = File.join(dir, basename);
  try {
    FileUtils.touch(fileName);
    return File.stat(fileName);
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
    fileName = null;
    return null;
  } finally {
    if (fileName) FileUtils.rmF(fileName);
  }
}
