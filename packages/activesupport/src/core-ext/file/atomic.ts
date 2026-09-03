import { File, FileUtils, type FsStatResult } from "@blazetrails/ruby-compat";
import { Tempfile } from "../../tempfile.js";

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
      ? File.stat(fileName)
      : probeStatIn(File.dirname(fileName));

    if (oldStat) {
      try {
        if (oldStat.uid != null && oldStat.gid != null) {
          File.chown(oldStat.uid, oldStat.gid, tempFile.path!);
        }
        if (oldStat.mode != null) File.chmod(oldStat.mode, tempFile.path!);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== "EPERM" && code !== "EACCES") throw error;
      }
    }

    File.rename(tempFile.path!, fileName);
    return returnVal;
  });
}

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
