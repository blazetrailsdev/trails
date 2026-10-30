import { beforeEach, describe, expect, it } from "vitest";
import {
  File,
  FileUtils,
  FrozenError,
  Pathname,
  block,
  flatten,
  rbObjClone,
  rbObjDup,
} from "@blazetrails/ruby-compat";
import { ext, pathmap } from "./ext/string.js";
import { FileList } from "./file-list.js";
import { captureOutput } from "./test-helpers/application.js";
import { useRakeTestCase } from "./test-helpers/file-creation.js";

const sorted = async (fl: FileList) => (await fl.sort()).toA();

describe("TestRakeFileList", () => {
  useRakeTestCase();
  const cdir = "cfiles";

  beforeEach(async () => {
    await FileUtils.mkdirPAsync("CVS");
    await FileUtils.mkdirPAsync(".svn");
    await FileUtils.mkdirPAsync(cdir);
    for (const fn of [
      ".dummy",
      "x.bak",
      "x~",
      "core",
      "x.c",
      "xyz.c",
      "abc.c",
      "abc.h",
      "abc.x",
      "existing",
    ]) {
      await File.writeAsync(fn, "");
    }
    await File.writeAsync("xyzzy.txt", "x\nXYZZY\n");
  });

  it("delegating methods do not include to a or to ary", () => {
    expect(FileList.DELEGATING_METHODS.includes("toA")).toBe(false);
    expect(FileList.DELEGATING_METHODS.includes("toAry")).toBe(false);
  });

  it("create", async () => {
    expect(await new FileList().size()).toEqual(0);
  });

  it("create with args", async () => {
    expect(await sorted(new FileList("*.c", "x"))).toEqual(["abc.c", "x", "x.c", "xyz.c"]);
  });

  it("create with pathname", async () => {
    expect(await sorted(new FileList(new Pathname("*.c")))).toEqual(["abc.c", "x.c", "xyz.c"]);
  });

  it("create with block", async () => {
    const fl = new FileList(block((f: FileList) => f.include("x")));
    expect(await (await fl.resolve()).toA()).toEqual(["x"]);
  });

  it("create with brackets", async () => {
    expect(await sorted(FileList.get("*.c", "x"))).toEqual(["abc.c", "x", "x.c", "xyz.c"]);
  });

  it("create with brackets and filelist", async () => {
    const fl = FileList.get(FileList.get("*.c", "x"));
    expect(await sorted(fl)).toEqual(["abc.c", "x", "x.c", "xyz.c"]);
  });

  it("include with another array", async () => {
    expect(await sorted(new FileList().include(["x", "y", "z"]))).toEqual(["x", "y", "z"]);
  });

  it("include with another filelist", async () => {
    const fl = new FileList().include(FileList.get("*.c", "x"));
    expect(await sorted(fl)).toEqual(["abc.c", "x", "x.c", "xyz.c"]);
  });

  it("include with pathname", async () => {
    const fl = new FileList().include(new Pathname("*.c"));
    expect(await sorted(fl)).toEqual(["abc.c", "x.c", "xyz.c"]);
  });

  it("append", async () => {
    const fl = new FileList();
    await (await fl.append("a.rb")).append("b.rb");
    expect(await fl.toA()).toEqual(["a.rb", "b.rb"]);
  });

  it("append pathname", async () => {
    const fl = new FileList();
    await fl.append(new Pathname("a.rb"));
    expect(await fl.toA()).toEqual(["a.rb"]);
  });

  it("add many", async () => {
    const fl = new FileList();
    fl.include(["a", "d", "c"]);
    fl.include("x", "y");
    expect(await fl.toA()).toEqual(["a", "d", "c", "x", "y"]);
    expect(await (await fl.resolve()).toA()).toEqual(["a", "d", "c", "x", "y"]);
  });

  it("add return", async () => {
    const f = new FileList();
    expect(await f.append("x")).toBe(f);
    expect(f.include("y")).toBe(f);
  });

  it("match", async () => {
    expect(await sorted(new FileList().include("*.c"))).toEqual(["abc.c", "x.c", "xyz.c"]);
  });

  it("add matching", async () => {
    const fl = new FileList();
    await fl.append("a.java");
    fl.include("*.c");
    expect(await sorted(fl)).toEqual(["a.java", "abc.c", "x.c", "xyz.c"]);
  });

  it("multiple patterns", async () => {
    const fl = new FileList();
    fl.include("*.z", "*foo*");
    expect(await fl.toA()).toEqual([]);
    fl.include("*.c", "*xist*");
    expect(await sorted(fl)).toEqual(["abc.c", "existing", "x.c", "xyz.c"]);
  });

  it("square bracket pattern", async () => {
    const fl = new FileList().include("abc.[ch]");
    expect(await fl.size()).toEqual(2);
    expect(await fl.isInclude("abc.c")).toBe(true);
    expect(await fl.isInclude("abc.h")).toBe(true);
  });

  it("curly bracket pattern", async () => {
    const fl = new FileList().include("abc.{c,h}");
    expect(await fl.size()).toEqual(2);
    expect(await fl.isInclude("abc.c")).toBe(true);
    expect(await fl.isInclude("abc.h")).toBe(true);
  });

  it("reject", async () => {
    const fl = new FileList().include(["x.c", "abc.c", "xyz.c", "existing"]);
    await fl.rejectBang((fn) => /^x/.test(fn));
    expect(await fl.toA()).toEqual(["abc.c", "existing"]);
  });

  it("exclude", async () => {
    const fl = FileList.get("x.c", "abc.c", "xyz.c", "existing");
    const x = await fl.exclude(/^x.+\./);
    expect(x.constructor).toBe(FileList);
    expect(await fl.toA()).toEqual(["x.c", "abc.c", "existing"]);
    expect(x).toBe(fl);
    await fl.exclude("*.c");
    expect(await fl.toA()).toEqual(["existing"]);
    await fl.exclude("existing");
    expect(await fl.toA()).toEqual([]);
  });

  it("exclude pathname", async () => {
    const fl = FileList.get("x.c", "abc.c", "other");
    await fl.exclude(new Pathname("*.c"));
    expect(await fl.toA()).toEqual(["other"]);
  });

  it("excluding via block", async () => {
    const fl = FileList.get("a.c", "b.c", "xyz.c");
    await fl.exclude(block((fn: string) => pathmap(fn, "%n") === "xyz"));
    expect(await fl.isExcludedFromList("xyz.c")).toBe(true);
    expect(await fl.toA()).toEqual(["a.c", "b.c"]);
  });

  it("exclude return on create", async () => {
    const fl = await FileList.get("*").exclude(/.*\.[hcx]$/);
    expect(await sorted(fl)).toEqual(["cfiles", "existing", "xyzzy.txt"]);
    expect(fl.constructor).toBe(FileList);
  });

  it("exclude with string return on create", async () => {
    const fl = await FileList.get("*").exclude("abc.c");
    expect(await sorted(fl)).toEqual([
      "abc.h",
      "abc.x",
      "cfiles",
      "existing",
      "x.c",
      "xyz.c",
      "xyzzy.txt",
    ]);
    expect(fl.constructor).toBe(FileList);
  });

  it("exclude curly bracket pattern", async () => {
    const fl = await FileList.get("*").exclude("{abc,xyz}.c");
    expect(await fl.toA()).toEqual(["abc.h", "abc.x", "cfiles", "existing", "x.c", "xyzzy.txt"]);
  });

  it("exclude an array", async () => {
    const fl = await FileList.get("*").exclude(["existing", "*.c"]);
    expect(await fl.toA()).toEqual(["abc.h", "abc.x", "cfiles", "xyzzy.txt"]);
  });

  it("exclude a filelist", async () => {
    const excluded = FileList.get("existing", "*.c");
    const fl = await FileList.get("*").exclude(excluded);
    expect(await fl.toA()).toEqual(["abc.h", "abc.x", "cfiles", "xyzzy.txt"]);
  });

  it("default exclude", async () => {
    const fl = new FileList();
    fl.clearExclude();
    fl.include("**/*~", "**/*.bak", "**/core");
    expect(await fl.isMember("core")).toBe(true);
    expect(await fl.isMember("x.bak")).toBe(true);
  });

  it("unique", async () => {
    const fl = new FileList();
    for (const fn of ["x.c", "a.c", "b.rb", "a.c"]) await fl.append(fn);
    expect(await fl.toA()).toEqual(["x.c", "a.c", "b.rb", "a.c"]);
    await fl.uniqBang();
    expect(await fl.toA()).toEqual(["x.c", "a.c", "b.rb"]);
  });

  it("to string", async () => {
    const fl = new FileList();
    await (await fl.append("a.java")).append("b.java");
    expect(await fl.toS()).toEqual("a.java b.java");
  });

  it("to array", async () => {
    const fl = FileList.get("a.java", "b.java");
    expect(await fl.toA()).toEqual(["a.java", "b.java"]);
    expect(Array.isArray(await fl.toA())).toBe(true);
    expect(await fl.toAry()).toEqual(["a.java", "b.java"]);
    expect(Array.isArray(await fl.toAry())).toBe(true);
  });

  it("to s pending", async () => {
    const result = await FileList.get("abc.*").toS();
    expect(result).toMatch(/abc\.c/);
    expect(result).toMatch(/abc\.h/);
    expect(result).toMatch(/abc\.x/);
    expect(result).toMatch(/(abc\..\b ?){2}/);
  });

  it("inspect pending", async () => {
    const result = await FileList.get("abc.*").inspect();
    expect(result).toMatch(/"abc\.c"/);
    expect(result).toMatch(/"abc\.h"/);
    expect(result).toMatch(/"abc\.x"/);
    expect(result).toMatch(/^\[("abc\..", ){2}"abc\.."\]$/);
  });

  it("sub", async () => {
    const fl = FileList.get("*.c");
    const f2 = await fl.sub(/\.c$/, ".o");
    expect(f2.constructor).toBe(FileList);
    expect(await sorted(f2)).toEqual(["abc.o", "x.o", "xyz.o"]);
    const f3 = await fl.gsub(/\.c$/, ".o");
    expect(f3.constructor).toBe(FileList);
    expect(await sorted(f3)).toEqual(["abc.o", "x.o", "xyz.o"]);
  });

  // PERMANENT-SKIP: CLAUDE.md § "Ruby protocol methods with a different JS mechanism": `is_a?` is a hook on the class tested against, and `Array[Symbol.hasInstance]` would reroute every `instanceof Array` in the process.
  it.skip("claim to be a kind of array", () => {});

  it("claim to be a kind of filelist", () => {
    expect(FileList.get("*.c") instanceof FileList).toBe(true);
  });

  it("claim to be a filelist instance", () => {
    expect(FileList.get("*.c").constructor).toBe(FileList);
  });

  it("dont claim to be an array instance", () => {
    expect(Array.isArray(FileList.get("*.c"))).toBe(false);
  });

  it("sub!", async () => {
    const f = "x/a.c";
    const fl = FileList.get(f, "x/b.c");
    const res = await fl.subBang(/\.c$/, ".o");
    expect(await sorted(fl)).toEqual(["x/a.o", "x/b.o"]);
    expect(f).toEqual("x/a.c");
    expect(res).toBe(fl);
  });

  it("sub with block", async () => {
    const fl = FileList.get("src/org/onestepback/a.java", "src/org/onestepback/b.java");
    const f2 = await fl.sub(/^src\/(.*)\.java$/, "classes/\\1.class");
    expect(await sorted(f2)).toEqual([
      "classes/org/onestepback/a.class",
      "classes/org/onestepback/b.class",
    ]);
  });

  it("string ext", () => {
    expect(ext("one.two", "net")).toEqual("one.net");
    expect(ext("one.two", ".net")).toEqual("one.net");
    expect(ext("one", "net")).toEqual("one.net");
    expect(ext("one", ".net")).toEqual("one.net");
    expect(ext("one.two.c", ".net")).toEqual("one.two.net");
    expect(ext("one/two.c", ".net")).toEqual("one/two.net");
    expect(ext("one.x/two.c", ".net")).toEqual("one.x/two.net");
    expect(ext("one.x/two", ".net")).toEqual("one.x/two.net");
    expect(ext(".onerc.dot", "net")).toEqual(".onerc.net");
    expect(ext(".onerc", "net")).toEqual(".onerc.net");
    expect(ext(".a/.onerc", "net")).toEqual(".a/.onerc.net");
    expect(ext("one.two", "")).toEqual("one");
    expect(ext("one.two")).toEqual("one");
    expect(ext(".one.two")).toEqual(".one");
    expect(ext(".one")).toEqual(".one");
    expect(ext(".", "c")).toEqual(".");
    expect(ext("..", "c")).toEqual("..");
  });

  it("filelist ext", async () => {
    const fl = await FileList.get("one.net", ".one").ext("c");
    expect(await fl.equals(FileList.get("one.c", ".one.c"))).toBe(true);
  });

  it("gsub", async () => {
    const f2 = await FileList.get("*.c").gsub(/a/, "A");
    expect(await sorted(f2)).toEqual(["Abc.c", "x.c", "xyz.c"]);
  });

  it("gsub!", async () => {
    const f = FileList.get("*.c");
    await f.gsubBang(/a/, "A");
    expect(await sorted(f)).toEqual(["Abc.c", "x.c", "xyz.c"]);
  });

  it("egrep returns 0 if no matches", async () => {
    const files = await FileList.get("test/lib/*_test.rb").exclude("test/lib/filelist_test.rb");
    expect(
      await files.egrep(
        /XYZZY/,
        block(() => {}),
      ),
    ).toEqual(0);
  });

  it("egrep with output", async () => {
    const files = FileList.get("*.txt");
    const [out] = await captureOutput(() => files.egrep(/XYZZY/));
    expect(out).toEqual("xyzzy.txt:2:XYZZY\n");
  });

  it("egrep with block", async () => {
    const files = FileList.get("*.txt");
    let found: unknown = null;
    await files.egrep(
      /XYZZY/,
      block((fn: string, ln: number, line: string) => void (found = [fn, ln, line])),
    );
    expect(found).toEqual(["xyzzy.txt", 2, "XYZZY\n"]);
  });

  it("egrep with error", async () => {
    const files = FileList.get("*.txt");
    const [, err] = await captureOutput(() =>
      files.egrep(
        /XYZZY/,
        block(() => {
          throw new Error("_EGREP_FAILURE_");
        }),
      ),
    );
    expect(err).toEqual("Error while processing 'xyzzy.txt': _EGREP_FAILURE_\n");
  });

  it("existing", async () => {
    const fl = FileList.get("*c.c", "notthere.c", "a*.c");
    expect(await (await fl.existing()).toA()).toEqual(["abc.c"]);
    expect((await fl.existing()) instanceof FileList).toBe(true);
  });

  it("existing!", async () => {
    const fl = FileList.get("*c.c", "notthere.c", "a*.c");
    const result = await fl.existingBang();
    expect(await fl.toA()).toEqual(["abc.c"]);
    expect(result).toBe(fl);
  });

  it("ignore special", async () => {
    const f = FileList.get("*");
    for (const fn of ["CVS", ".svn", ".dummy", "x.bak", "x~", "core"]) {
      expect(await f.isInclude(fn)).toBe(false);
    }
  });

  it("clear ignore patterns", async () => {
    const f = FileList.get("*", ".svn");
    f.clearExclude();
    for (const fn of ["abc.c", "xyz.c", "CVS", ".svn", "x.bak", "x~"]) {
      expect(await f.isInclude(fn)).toBe(true);
    }
  });

  it("exclude with alternate file seps", async () => {
    const fl = new FileList();
    for (const fn of ["x/CVS/y", "x\\CVS\\y", "x/.svn/y", "x\\.svn\\y", "x/core", "x\\core"]) {
      expect(await fl.isExcludedFromList(fn)).toBe(true);
    }
  });

  it("add default exclude list", async () => {
    const fl = new FileList();
    await fl.exclude(/~\d+$/);
    for (const fn of [
      "x/CVS/y",
      "x\\CVS\\y",
      "x/.svn/y",
      "x\\.svn\\y",
      "x/core",
      "x\\core",
      "x/abc~1",
    ]) {
      expect(await fl.isExcludedFromList(fn)).toBe(true);
    }
  });

  it("basic array functions", async () => {
    const f = FileList.get("b", "c", "a");
    expect(await f.first()).toEqual("b");
    expect(await f.get(0)).toEqual("b");
    expect(await f.last()).toEqual("a");
    expect(await f.get(2)).toEqual("a");
    expect(await f.get(-1)).toEqual("a");
    expect(await sorted(f)).toEqual(["a", "b", "c"]);
    await f.sortBang();
    expect(await f.toA()).toEqual(["a", "b", "c"]);
  });

  it("flatten", async () => {
    expect(flatten(["a", await FileList.get("*.c").toA()]).sort()).toEqual([
      "a",
      "abc.c",
      "x.c",
      "xyz.c",
    ]);
  });

  it("clone and dup", async () => {
    const a = FileList.get("a", "b", "c");
    const c = rbObjClone(a);
    const d = rbObjDup(a);
    await a.append("d");
    expect(await a.toA()).toEqual(["a", "b", "c", "d"]);
    expect(await c.toA()).toEqual(["a", "b", "c"]);
    expect(await d.toA()).toEqual(["a", "b", "c"]);
  });

  it("duped items will thaw", async () => {
    const a = FileList.get("a", "b", "c");
    Object.freeze(a);
    const d = rbObjDup(a);
    await d.append("more");
    expect(await d.toA()).toEqual(["a", "b", "c", "more"]);
  });

  it("cloned items stay frozen", async () => {
    const a = FileList.get("a", "b", "c");
    Object.freeze(a);
    const c = rbObjClone(a);
    await expect(c.append("more")).rejects.toThrow(FrozenError);
  });

  it("array comparisons", async () => {
    const fl = FileList.get("b", "b");
    expect(await fl.compare(["b", "a"])).toEqual(1);
    expect(await fl.compare(["b", "b"])).toEqual(0);
    expect(await fl.compare(["b", "c"])).toEqual(-1);
  });

  it("array equality", async () => {
    const a = FileList.get("a", "b");
    const b = ["a", "b"];
    expect(await a.equals(b)).toBe(true);
    expect(a).not.toBe(b);
  });

  it("enumeration methods", async () => {
    const a = FileList.get("a", "b");
    const check = async (fl: FileList, expected: string[]) => {
      expect(await fl.toA()).toEqual(expected);
      expect(fl.constructor).toBe(FileList);
    };
    await check(await a.map((it) => it.toUpperCase()), ["A", "B"]);
    await check(await a.sort(), ["a", "b"]);
    await check(await a.sortBy((it) => it), ["a", "b"]);
    await check(await a.select((it) => it === "b"), ["b"]);
    await check(await a.select((it) => it.length === 1), ["a", "b"]);
    await check(await a.reject((it) => it === "b"), ["a"]);
    await check(await a.grep(/./), ["a", "b"]);
    const [yes, no] = await a.partition((it) => it === "b");
    await check(yes, ["b"]);
    await check(no, ["a"]);
    expect(await a.zip(["x", "y"])).toEqual([
      ["a", "x"],
      ["b", "y"],
    ]);
  });

  it("array operators", async () => {
    const f = FileList.get("x", "y");
    const g = FileList.get("w", "z");
    let r = await f.plus(g);
    expect(await r.toA()).toEqual(["x", "y", "w", "z"]);
    expect(r.constructor).toBe(FileList);
    r = await f.plus(["c", "d"]);
    expect(await r.toA()).toEqual(["x", "y", "c", "d"]);
    r = await FileList.get("w", "x", "y", "z").minus(f);
    expect(await r.toA()).toEqual(["w", "z"]);
    r = await FileList.get("w", "x", "y", "z").and(f);
    expect(await r.toA()).toEqual(["x", "y"]);
    expect(await (f.multiply(2) as FileList).toA()).toEqual(["x", "y", "x", "y"]);
    expect(f.multiply(",")).toEqual("x,y");
    r = await f.or(["a", "x"]);
    expect(await sorted(r)).toEqual(["a", "x", "y"]);
  });

  it("other array returning methods", async () => {
    let r = await FileList.get("a", null, "b").compact();
    expect(await r.toA()).toEqual(["a", "b"]);
    expect(r.constructor).toBe(FileList);
    r = await FileList.get("a", "b").concat(["x", "y"]);
    expect(await r.toA()).toEqual(["a", "b", "x", "y"]);
    expect(r.constructor).toBe(FileList);
    r = await FileList.get("a", ["b", "c"], FileList.get("d", "e")).flatten();
    expect(await r.toA()).toEqual(["a", "b", "c", "d", "e"]);
    r = await FileList.get("a", "b", "a").uniq();
    expect(await r.toA()).toEqual(["a", "b"]);
    r = await FileList.get("a", "b", "c", "d").valuesAt(1, 3);
    expect(await r.toA()).toEqual(["b", "d"]);
  });

  it("special return delegating methods object type", async () => {
    class CustomFileList extends FileList {}
    const f = new CustomFileList() as unknown as Record<string, (arg: unknown) => Promise<object>>;
    const ops: Record<string, unknown> = { grep: /./ };
    for (const m of FileList.SPECIAL_RETURN) {
      const needsBlock = ["map", "collect", "sortBy", "select", "findAll", "reject"].includes(m);
      const r = await f[m](needsBlock ? () => true : (ops[m] ?? []));
      expect(r.constructor).toBe(CustomFileList);
    }
  });

  it("file utils can use filelists", async () => {
    await FileUtils.cpAsync((await FileList.get("*.c").toA()) as string[], cdir);
    expect(await File.isExistAsync(File.join(cdir, "abc.c"))).toBe(true);
    expect(await File.isExistAsync(File.join(cdir, "xyz.c"))).toBe(true);
    expect(await File.isExistAsync(File.join(cdir, "x.c"))).toBe(true);
  });
});
