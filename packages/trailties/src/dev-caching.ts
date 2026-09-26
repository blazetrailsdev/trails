import { File, FileUtils, stdout } from "@blazetrails/ruby-compat";

export class DevCaching {
  static readonly FILE = "tmp/caching-dev.txt";

  static enableByFile(): void {
    FileUtils.mkdirP("tmp");

    if (File.isExist(DevCaching.FILE)) {
      DevCaching.deleteCacheFile();
      stdout.write("Action Controller caching disabled for development mode.\n");
    } else {
      DevCaching.createCacheFile();
      stdout.write("Action Controller caching enabled for development mode.\n");
    }

    FileUtils.touch("tmp/restart.txt");
  }

  static enableByArgument(caching: boolean | null | undefined): void {
    FileUtils.mkdirP("tmp");

    if (caching != null && caching !== false) {
      DevCaching.createCacheFile();
    } else if (caching === false && File.isExist(DevCaching.FILE)) {
      DevCaching.deleteCacheFile();
    }
  }

  private static createCacheFile(): void {
    FileUtils.touch(DevCaching.FILE);
  }

  private static deleteCacheFile(): void {
    File.delete(DevCaching.FILE);
  }
}
