import { Dir } from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileList } from "../lib/file-list.js";
import { FileUtilsExt } from "../lib/file-utils-ext.js";
import { PackageTask } from "../lib/packagetask.js";
import { Task } from "../lib/task.js";
import { useApplicationTestCase } from "./support/application.js";

describe("PackageTask#define archive tasks", () => {
  useApplicationTestCase();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function packageWith(withoutParentDir: boolean) {
    await FileUtilsExt.touch("a.c");
    const calls: { cwd: string; cmd: unknown[] }[] = [];
    const host = PackageTask.prototype as unknown as Record<
      "sh" | "mv",
      (...args: unknown[]) => Promise<unknown>
    >;
    vi.spyOn(host, "sh").mockImplementation(async (...cmd: unknown[]) => {
      calls.push({ cwd: Dir.pwd(), cmd });
      return true;
    });
    const mv = vi.spyOn(host, "mv").mockImplementation(async () => null);
    const packageFiles = new FileList();
    packageFiles.include("a.c");
    await packageFiles.resolve();
    new PackageTask("pkgr", "1.2.3", (p) => {
      p.packageFiles = packageFiles;
      p.needTar = true;
      p.needTarGz = true;
      p.needTarBz2 = true;
      p.needTarXz = true;
      p.needZip = true;
      p.tarCommand = "gtar";
      p.withoutParentDir = withoutParentDir;
    });
    await (await Task.get("package")).invoke();
    return { calls, mv };
  }

  it("shells each tar and zip command from the package dir", async () => {
    const { calls, mv } = await packageWith(false);
    expect(calls.map((c) => c.cmd)).toEqual([
      ["gtar", "zcvf", "pkgr-1.2.3.tgz", "pkgr-1.2.3"],
      ["gtar", "zcvf", "pkgr-1.2.3.tar.gz", "pkgr-1.2.3"],
      ["gtar", "jcvf", "pkgr-1.2.3.tar.bz2", "pkgr-1.2.3"],
      ["gtar", "Jcvf", "pkgr-1.2.3.tar.xz", "pkgr-1.2.3"],
      ["zip", "-r", "pkgr-1.2.3.zip", "pkgr-1.2.3"],
    ]);
    for (const c of calls) expect(c.cwd.endsWith("/pkg")).toBe(true);
    expect(mv).not.toHaveBeenCalled();
  });

  it("archives the package dir contents and moves them up when without_parent_dir", async () => {
    const { calls, mv } = await packageWith(true);
    expect(calls.map((c) => c.cmd)).toEqual([
      ["gtar", "zcvf", "pkgr-1.2.3.tgz", "."],
      ["gtar", "zcvf", "pkgr-1.2.3.tar.gz", "."],
      ["gtar", "jcvf", "pkgr-1.2.3.tar.bz2", "."],
      ["gtar", "Jcvf", "pkgr-1.2.3.tar.xz", "."],
      ["zip", "-r", "pkgr-1.2.3.zip", "."],
    ]);
    for (const c of calls) expect(c.cwd.endsWith("/pkg/pkgr-1.2.3")).toBe(true);
    expect(mv.mock.calls).toEqual([
      ["pkg/pkgr-1.2.3/.", "pkg"],
      ["pkg/pkgr-1.2.3/.", "pkg"],
      ["pkg/pkgr-1.2.3/.", "pkg"],
      ["pkg/pkgr-1.2.3/.", "pkg"],
      ["pkg/pkgr-1.2.3/pkgr-1.2.3.zip", "pkg"],
    ]);
  });
});
