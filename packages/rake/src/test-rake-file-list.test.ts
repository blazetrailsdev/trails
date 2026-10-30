import { beforeEach, describe, expect, it } from "vitest";
import {
  File,
  FileUtils,
  FrozenError,
  Pathname,
  RuntimeError,
  block,
  flatten,
  rbEqual,
  rbObjClone,
  rbObjDup,
  rbObjIsKindOf,
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
    expect(!FileList.DELEGATING_METHODS.includes("toA")).toBeTruthy();
    expect(!FileList.DELEGATING_METHODS.includes("to_a")).toBeTruthy();
    expect(!FileList.DELEGATING_METHODS.includes("toAry")).toBeTruthy();
    expect(!FileList.DELEGATING_METHODS.includes("to_ary")).toBeTruthy();
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
    expect((await fl.size()) === 2).toBeTruthy();
    expect(await fl.isInclude("abc.c")).toBeTruthy();
    expect(await fl.isInclude("abc.h")).toBeTruthy();
  });

  it("curly bracket pattern", async () => {
    const fl = new FileList().include("abc.{c,h}");
    expect((await fl.size()) === 2).toBeTruthy();
    expect(await fl.isInclude("abc.c")).toBeTruthy();
    expect(await fl.isInclude("abc.h")).toBeTruthy();
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
    expect(await fl.isExcludedFromList("xyz.c")).toBeTruthy();
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
    expect(await fl.isMember("core")).toBeTruthy();
    expect(await fl.isMember("x.bak")).toBeTruthy();
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
    expect(`${await fl.toS()}`).toEqual("a.java b.java");
  });

  it("to array", async () => {
    const fl = FileList.get("a.java", "b.java");
    expect(await fl.toA()).toEqual(["a.java", "b.java"]);
    expect((await fl.toA()).constructor).toEqual(Array);
    expect(await fl.toAry()).toEqual(["a.java", "b.java"]);
    expect((await fl.toAry()).constructor).toEqual(Array);
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
    const fl = FileList.get("*.c");
    expect(fl instanceof FileList).toBeTruthy();
    expect(rbObjIsKindOf(fl, FileList)).toBeTruthy();
  });

  it("claim to be a filelist instance", () => {
    expect(FileList.get("*.c").constructor === FileList).toBeTruthy();
  });

  it("dont claim to be an array instance", () => {
    expect(!Array.isArray(FileList.get("*.c"))).toBeTruthy();
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
    expect(await FileList.get("one.c", ".one.c").toA()).toEqual(
      await (await FileList.get("one.net", ".one").ext("c")).toA(),
    );
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
          throw new RuntimeError("_EGREP_FAILURE_");
        }),
      ),
    );
    expect(err).toEqual("Error while processing 'xyzzy.txt': _EGREP_FAILURE_\n");
  });

  it("existing", async () => {
    const fl = FileList.get("*c.c", "notthere.c", "a*.c");
    expect(await (await fl.existing()).toA()).toEqual(["abc.c"]);
    expect((await fl.existing()) instanceof FileList).toBeTruthy();
  });

  it("existing!", async () => {
    const fl = FileList.get("*c.c", "notthere.c", "a*.c");
    const result = await fl.existingBang();
    expect(await fl.toA()).toEqual(["abc.c"]);
    expect(result).toBe(fl);
  });

  it("ignore special", async () => {
    const f = FileList.get("*");
    expect(!(await f.isInclude("CVS"))).toBeTruthy();
    expect(!(await f.isInclude(".svn"))).toBeTruthy();
    expect(!(await f.isInclude(".dummy"))).toBeTruthy();
    expect(!(await f.isInclude("x.bak"))).toBeTruthy();
    expect(!(await f.isInclude("x~"))).toBeTruthy();
    expect(!(await f.isInclude("core"))).toBeTruthy();
  });

  it("clear ignore patterns", async () => {
    const f = FileList.get("*", ".svn");
    f.clearExclude();
    expect(await f.isInclude("abc.c")).toBeTruthy();
    expect(await f.isInclude("xyz.c")).toBeTruthy();
    expect(await f.isInclude("CVS")).toBeTruthy();
    expect(await f.isInclude(".svn")).toBeTruthy();
    expect(await f.isInclude("x.bak")).toBeTruthy();
    expect(await f.isInclude("x~")).toBeTruthy();
  });

  it("exclude with alternate file seps", async () => {
    const fl = new FileList();
    expect(await fl.isExcludedFromList("x/CVS/y")).toBeTruthy();
    expect(await fl.isExcludedFromList("x\\CVS\\y")).toBeTruthy();
    expect(await fl.isExcludedFromList("x/.svn/y")).toBeTruthy();
    expect(await fl.isExcludedFromList("x\\.svn\\y")).toBeTruthy();
    expect(await fl.isExcludedFromList("x/core")).toBeTruthy();
    expect(await fl.isExcludedFromList("x\\core")).toBeTruthy();
  });

  it("add default exclude list", async () => {
    const fl = new FileList();
    await fl.exclude(/~\d+$/);
    expect(await fl.isExcludedFromList("x/CVS/y")).toBeTruthy();
    expect(await fl.isExcludedFromList("x\\CVS\\y")).toBeTruthy();
    expect(await fl.isExcludedFromList("x/.svn/y")).toBeTruthy();
    expect(await fl.isExcludedFromList("x\\.svn\\y")).toBeTruthy();
    expect(await fl.isExcludedFromList("x/core")).toBeTruthy();
    expect(await fl.isExcludedFromList("x\\core")).toBeTruthy();
    expect(await fl.isExcludedFromList("x/abc~1")).toBeTruthy();
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
    const a = ["b", "a"];
    const b = ["b", "b"];
    const c = ["b", "c"];
    expect(await fl.compare(a)).toEqual(1);
    expect(await fl.compare(b)).toEqual(0);
    expect(await fl.compare(c)).toEqual(-1);
    expect(await new FileList().import(a).compare(fl)).toEqual(-1);
    expect(await new FileList().import(b).compare(fl)).toEqual(0);
    expect(await new FileList().import(c).compare(fl)).toEqual(1);
  });

  it("array equality", async () => {
    const a = FileList.get("a", "b");
    const b = ["a", "b"];
    expect(await a.equals(b)).toBeTruthy();
    expect(rbEqual(b, await a.toA())).toBeTruthy();
    expect(!Object.is(a, b)).toBeTruthy();
    expect(!Object.is(b, a)).toBeTruthy();
  });

  it("enumeration methods", async () => {
    const a = FileList.get("a", "b");
    let b: FileList;

    b = await a.map((it) => it.toUpperCase());
    expect(await b.toA()).toEqual(["A", "B"]);
    expect(b.constructor).toEqual(FileList);

    b = await a.map((it) => it.toUpperCase());
    expect(await b.toA()).toEqual(["A", "B"]);
    expect(b.constructor).toEqual(FileList);

    b = await a.sort();
    expect(await b.toA()).toEqual(["a", "b"]);
    expect(b.constructor).toEqual(FileList);

    b = await a.sortBy((it) => it);
    expect(await b.toA()).toEqual(["a", "b"]);
    expect(b.constructor).toEqual(FileList);

    b = await a.select((it) => it === "b");
    expect(await b.toA()).toEqual(["b"]);
    expect(b.constructor).toEqual(FileList);

    b = await a.select((it) => it.length === 1);
    expect(await b.toA()).toEqual(["a", "b"]);
    expect(b.constructor).toEqual(FileList);

    b = await a.reject((it) => it === "b");
    expect(await b.toA()).toEqual(["a"]);
    expect(b.constructor).toEqual(FileList);

    b = await a.grep(/./);
    expect(await b.toA()).toEqual(["a", "b"]);
    expect(b.constructor).toEqual(FileList);

    const p = await a.partition((it) => it === "b");
    expect([await p[0].toA(), await p[1].toA()]).toEqual([["b"], ["a"]]);
    expect(p.constructor).toEqual(Array);
    expect(p[0].constructor).toEqual(FileList);
    expect(p[1].constructor).toEqual(FileList);

    const z = await a.zip(["x", "y"]);
    expect(z).toEqual([
      ["a", "x"],
      ["b", "y"],
    ]);
    expect(z.constructor).toEqual(Array);
    expect((z[0] as unknown[]).constructor).toEqual(Array);
    expect((z[1] as unknown[]).constructor).toEqual(Array);
  });

  it("array operators", async () => {
    const a = ["a", "b"];
    const b = ["c", "d"];
    const f = FileList.get("x", "y");
    const g = FileList.get("w", "z");

    let r = await f.plus(g);
    expect(await r.toA()).toEqual(["x", "y", "w", "z"]);
    expect(r.constructor).toEqual(FileList);

    const r2 = [...a, ...(await g.toA())];
    expect(r2).toEqual(["a", "b", "w", "z"]);
    expect(r2.constructor).toEqual(Array);

    r = await f.plus(b);
    expect(await r.toA()).toEqual(["x", "y", "c", "d"]);
    expect(r.constructor).toEqual(FileList);

    r = await FileList.get("w", "x", "y", "z").minus(f);
    expect(await r.toA()).toEqual(["w", "z"]);
    expect(r.constructor).toEqual(FileList);

    r = await FileList.get("w", "x", "y", "z").and(f);
    expect(await r.toA()).toEqual(["x", "y"]);
    expect(r.constructor).toEqual(FileList);

    r = f.multiply(2) as FileList;
    expect(await r.toA()).toEqual(["x", "y", "x", "y"]);
    expect(r.constructor).toEqual(FileList);

    const r3 = f.multiply(",");
    expect(r3).toEqual("x,y");
    expect(r3.constructor).toEqual(String);

    r = await f.or(["a", "x"]);
    expect(await sorted(r)).toEqual(["a", "x", "y"]);
    expect(r.constructor).toEqual(FileList);
  });

  it("other array returning methods", async () => {
    let r = await FileList.get("a", null, "b").compact();
    expect(await r.toA()).toEqual(["a", "b"]);
    expect(r.constructor).toEqual(FileList);

    r = await FileList.get("a", "b").concat(["x", "y"]);
    expect(await r.toA()).toEqual(["a", "b", "x", "y"]);
    expect(r.constructor).toEqual(FileList);

    r = await FileList.get("a", ["b", "c"], FileList.get("d", "e")).flatten();
    expect(await r.toA()).toEqual(["a", "b", "c", "d", "e"]);
    expect(r.constructor).toEqual(FileList);

    r = await FileList.get("a", "b", "a").uniq();
    expect(await r.toA()).toEqual(["a", "b"]);
    expect(r.constructor).toEqual(FileList);

    r = await FileList.get("a", "b", "c", "d").valuesAt(1, 3);
    expect(await r.toA()).toEqual(["b", "d"]);
    expect(r.constructor).toEqual(FileList);
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
    expect(await File.isExistAsync(File.join(cdir, "abc.c"))).toBeTruthy();
    expect(await File.isExistAsync(File.join(cdir, "xyz.c"))).toBeTruthy();
    expect(await File.isExistAsync(File.join(cdir, "x.c"))).toBeTruthy();
  });
});
