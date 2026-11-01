import { File, FileUtils, setEnv } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { dsl } from "./test-helpers/file-creation.js";
import { FileList } from "./file-list.js";
import { Rake } from "./rake-module.js";
import { useApplicationTestCase } from "./test-helpers/application.js";
import { TestTask } from "./testtask.js";

const isDefined = (name: string) => Rake.application!.lookup(name) != null;
const createFile = async (name: string) => {
  await File.writeAsync(name, "");
};
const prerequisitesOf = (name: string) => Rake.application!.lookup(name)!.prerequisites;

describe("TestRakeTestTask", () => {
  useApplicationTestCase();

  it("initialize", () => {
    const tt = new TestTask(() => {});
    expect(tt).not.toBeNull();
    expect(tt.name).toBe("test");
    expect(tt.libs).toEqual(["lib"]);
    expect(tt.pattern).toBe("test/test*.rb");
    expect(tt.verbose).toBe(false);
    expect(tt.warning).toBe(true);
    expect(tt.deps).toEqual([]);
    expect(isDefined("test")).toBeTruthy();
  });

  it("initialize deps", () => {
    const tt = new TestTask({ example: "bar" });
    expect(tt).not.toBeNull();
    expect(tt.deps).toBe("bar");
    expect(isDefined("example")).toBeTruthy();
  });

  it("initialize multi deps", () => {
    const tt = new TestTask({ example: ["foo", "bar"] });
    expect(tt).not.toBeNull();
    expect(tt.deps).toEqual(["foo", "bar"]);
    expect(isDefined("example")).toBeTruthy();
  });

  it("initialize override", () => {
    const tt = new TestTask({ example: "bar" }, (t) => {
      t.description = "Run example tests";
      t.libs = ["src", "ext"];
      t.pattern = "test/tc_*.rb";
      t.warning = true;
      t.verbose = true;
      t.deps = ["env"];
    });
    expect(tt).not.toBeNull();
    expect(tt.description).toBe("Run example tests");
    expect(tt.name).toBe("example");
    expect(tt.libs).toEqual(["src", "ext"]);
    expect(tt.pattern).toBe("test/tc_*.rb");
    expect(tt.warning).toBe(true);
    expect(tt.verbose).toBe(true);
    expect(tt.deps).toEqual(["env"]);
    expect(tt.rubyOptsString()).toMatch(/--pending-deprecation/);
    expect(isDefined("example")).toBeTruthy();
  });

  it("file list env test", async () => {
    setEnv("TEST", "testfile.rb");
    try {
      const tt = new TestTask((t) => {
        t.pattern = "*";
      });

      expect(await tt.fileList()).toEqual(["testfile.rb"]);
    } finally {
      setEnv("TEST", undefined);
    }
  });

  it("libs equals", () => {
    const testTask = new TestTask((t) => {
      (t.libs as unknown[]).push(["A", "B"]);
    });

    const path = ["lib", "A", "B"].join(File.PATH_SEPARATOR);

    expect(
      `${testTask.rubyOptsString()} ${testTask.runCode()}`.replace(/\S*rake-test-loader\.js/, "L"),
    ).toBe(`--pending-deprecation L -I"${path}"`);
  });

  it("libs equals empty", () => {
    const testTask = new TestTask((t) => {
      t.libs = [];
      t.warning = false;
    });

    expect(testTask.rubyOptsString()).toBe("");
  });

  it("pattern equals", async () => {
    for (const f of ["gl.rb", "ob.rb"]) await createFile(f);
    const tt = new TestTask((t) => {
      t.pattern = "*.rb";
    });
    expect(await tt.fileList()).toEqual(["gl.rb", "ob.rb"]);
  });

  it("pattern equals test files equals", async () => {
    for (const f of ["gl.rb", "ob.rb"]) await createFile(f);
    const tt = new TestTask((t) => {
      t.testFiles = FileList.get("a.rb", "b.rb");
      t.pattern = "*.rb";
    });
    expect(await tt.fileList()).toEqual(["a.rb", "b.rb", "gl.rb", "ob.rb"]);
  });

  it("run code direct", async () => {
    await FileUtils.mkdirPAsync("test");
    const globbed = ["test_gl.rb", "test_ob.rb"].map((f) => File.join("test", f));
    const others = ["a.rb", "b.rb"].map((f) => File.join("test", f));
    for (const f of [...globbed, ...others]) await createFile(f);
    const testTask = new TestTask((t) => {
      t.loader = "direct";
    });

    expect(testTask.runCode()).toContain(`LOAD_PATH.unshift('${File.expandPath("lib")}');`);
    expect(testTask.runCode()).toContain(
      "process.argv.slice(1).forEach((f) => require(require('path').resolve(f)));",
    );
    expect(await testTask.fileList()).toEqual(globbed);
  });

  it("run code rake", () => {
    const testTask = new TestTask((t) => {
      t.loader = "rake";
    });

    expect(testTask.runCode()).toContain("rake-test-loader.js");
  });

  it("test files equals", async () => {
    const tt = new TestTask((t) => {
      t.testFiles = FileList.get("a.rb", "b.rb");
    });

    expect(await tt.fileList()).toEqual(["a.rb", "b.rb"]);
  });

  it("task prerequisites", () => {
    new TestTask("parent");
    new TestTask({ child: "parent" });

    expect(prerequisitesOf("child")).toContain("parent");
  });

  it("task prerequisites multi", () => {
    new TestTask("parent");
    new TestTask("parent2");
    new TestTask({ child: ["parent", "parent2"] });

    expect(prerequisitesOf("child")).toContain("parent");
    expect(prerequisitesOf("child")).toContain("parent2");
  });

  it("task prerequisites deps", () => {
    new TestTask("parent");

    new TestTask("child", (t) => {
      t.deps = "parent";
    });

    expect(prerequisitesOf("child")).toContain("parent");
  });

  it("task order only prerequisites", async () => {
    const t = dsl.task({ a: "b" }).bitwiseOr("c");
    const [b, c] = [dsl.task("b"), dsl.task("c")];
    expect(t.prerequisites).toEqual(["b"]);
    expect(t.orderOnlyPrerequisites).toEqual(["c"]);
    expect(await t.prerequisiteTasks()).toEqual([b, c]);
  });

  it("task order only prerequisites key", async () => {
    const t = dsl.task({ a: "b", orderOnly: ["c"] });
    const [b, c] = [dsl.task("b"), dsl.task("c")];
    expect(t.prerequisites).toEqual(["b"]);
    expect(t.orderOnlyPrerequisites).toEqual(["c"]);
    expect(await t.prerequisiteTasks()).toEqual([b, c]);
  });
});
