import { RuntimeError, rbObjClone } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { FileList } from "../lib/file-list.js";
import { FileUtilsExt } from "../lib/file-utils-ext.js";
import { PackageTask } from "../lib/packagetask.js";
import { Task } from "../lib/task.js";
import { useApplicationTestCase } from "./support/application.js";

describe("TestRakePackageTask", () => {
  useApplicationTestCase();

  it("initialize", async () => {
    await FileUtilsExt.touch("install.rb");
    await FileUtilsExt.touch("a.c");
    await FileUtilsExt.touch("b.c");
    await FileUtilsExt.mkdir("CVS");
    await FileUtilsExt.touch("a.rb~");

    const packageFiles = new FileList();
    await packageFiles.append("install.rb");
    packageFiles.include("*.c");
    packageFiles.exclude(/\bCVS\b/);
    packageFiles.exclude(/~$/);
    await packageFiles.resolve();

    const pkg = new PackageTask("pkgr", "1.2.3", (p) => {
      p.packageFiles = packageFiles;
      p.packageDir = "pkg";
      p.needTar = true;
      p.needTarGz = true;
      p.needTarBz2 = true;
      p.needTarXz = true;
      p.needZip = true;
    });

    expect(pkg.packageDir).toBe("pkg");

    expect(await pkg.packageFiles.toA()).toContain("a.c");

    expect(pkg.name).toBe("pkgr");
    expect(pkg.version).toBe("1.2.3");
    expect(await Task.get("package")).toBeTruthy();
    expect(await Task.get("pkg/pkgr-1.2.3.tgz")).toBeTruthy();
    expect(await Task.get("pkg/pkgr-1.2.3.tar.gz")).toBeTruthy();
    expect(await Task.get("pkg/pkgr-1.2.3.tar.bz2")).toBeTruthy();
    expect(await Task.get("pkg/pkgr-1.2.3.tar.xz")).toBeTruthy();
    expect(await Task.get("pkg/pkgr-1.2.3.zip")).toBeTruthy();
    expect(await Task.get("pkg/pkgr-1.2.3")).toBeTruthy();
    expect(await Task.get("clobber_package")).toBeTruthy();
    expect(await Task.get("repackage")).toBeTruthy();
  });

  it("initialize no version", () => {
    const run = () => new PackageTask("pkgr");
    expect(run).toThrow(RuntimeError);
    const e = (() => {
      try {
        run();
      } catch (error) {
        return error as RuntimeError;
      }
    })()!;

    expect(e.message).toBe("Version required (or :noversion)");
  });

  it("initialize noversion", () => {
    const pkg = new PackageTask("pkgr", ":noversion");

    expect(pkg.packageDir).toBe("pkg");
    expect(pkg.name).toBe("pkgr");
    expect(pkg.version).toBeNull();
  });

  it("clone", async () => {
    const pkg = new PackageTask("x", ":noversion");
    const p2 = rbObjClone(pkg);
    await pkg.packageFiles.append("y");
    await p2.packageFiles.append("x");
    expect(await pkg.packageFiles.toA()).toEqual(["y"]);
    expect(await p2.packageFiles.toA()).toEqual(["x"]);
  });

  it("package name", () => {
    const pkg = new PackageTask("a", "1");

    expect(pkg.packageName()).toBe("a-1");
  });

  it("package name noversion", () => {
    const pkg = new PackageTask("a", ":noversion");

    expect(pkg.packageName()).toBe("a");
  });

  it("without parent dir", () => {
    const pkg = new PackageTask("foo", ":noversion");

    expect(pkg.workingDir()).toBe("pkg");
    expect(pkg.targetDir()).toBe("foo");

    pkg.withoutParentDir = true;

    expect(pkg.workingDir()).toBe("pkg/foo");
    expect(pkg.targetDir()).toBe(".");
  });
});
