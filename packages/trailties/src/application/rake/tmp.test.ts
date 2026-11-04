import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Rake } from "@blazetrails/rake";
import { Dir, File, FileUtils, rbFLoad } from "@blazetrails/ruby-compat";

async function tmpClear(): Promise<void> {
  await Rake.withApplication(async (rake) => {
    await rbFLoad(File.join(import.meta.dirname, "../../tasks/tmp.ts"));
    await rake.lookup("tmp:clear")!.invoke();
  });
}

describe("TmpTest", () => {
  const originalCwd = Dir.pwd();
  let appPath: string;

  beforeEach(() => {
    appPath = Dir.mktmpdir("tmp-test");
    Dir.chdir(appPath);
  });

  afterEach(() => {
    Dir.chdir(originalCwd);
    FileUtils.rmRf(appPath);
  });

  it("tmp:clear clear cache, socket, screenshot, and storage files", async () => {
    FileUtils.mkdirP("tmp/cache");
    FileUtils.touch("tmp/cache/cache_file");

    FileUtils.mkdirP("tmp/sockets");
    FileUtils.touch("tmp/sockets/socket_file");

    FileUtils.mkdirP("tmp/screenshots");
    FileUtils.touch("tmp/screenshots/fail.png");

    FileUtils.mkdirP("tmp/storage/6h/np");
    FileUtils.touch("tmp/storage/6h/np/6hnp81jvgt42pcfqtlpoy8qshfb0");

    await tmpClear();

    expect(File.isExist("tmp/cache/cache_file")).toBeFalsy();
    expect(File.isExist("tmp/sockets/socket_file")).toBeFalsy();
    expect(File.isExist("tmp/screenshots/fail.png")).toBeFalsy();
    expect(File.isExist("tmp/storage/6h/np/6hnp81jvgt42pcfqtlpoy8qshfb0")).toBeFalsy();
  });

  it("tmp:clear should work if folder missing", async () => {
    await tmpClear();
  });
});
