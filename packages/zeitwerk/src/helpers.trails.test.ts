import { Dir, File, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Cref } from "./cref.js";
import { Map } from "./cref/map.js";
import { describe, expect, it, afterEach } from "vitest";
import { NameError } from "./error.js";
import { newLoader, teardown, withFiles } from "./test-helpers/loader-test.js";

describe("Zeitwerk::Loader::Helpers", () => {
  afterEach(teardown);

  it("ruby? answers source files only", async () => {
    const loader = newLoader();
    await withFiles(
      [["post.ts"], ["post.js"], ["alone.js"], ["post.d.ts"], ["post.test.ts"], ["x.rb"]],
      async () => {
        expect(await loader.isRuby("post.ts")).toBe(true);
        expect(await loader.isRuby("alone.js")).toBe(true);
        expect(await loader.isRuby("post.js")).toBe(false);
        expect(await loader.isRuby("post.d.ts")).toBe(false);
        expect(await loader.isRuby("post.test.ts")).toBe(false);
        expect(await loader.isRuby("x.rb")).toBe(false);
      },
    );
  });

  it("ls yields Ruby's basename, sorted, skipping what is not source", async () => {
    const loader = newLoader();
    await withFiles(
      [["html-parser.ts"], ["a/b.ts"], ["empty/notes.txt"], [".hidden.ts"], ["ignored.ts"]],
      async () => {
        await loader.ignore("ignored.ts");
        const seen: [string, string][] = [];
        await loader.ls(Dir.pwd(), (b, _a, t) => {
          seen.push([b, t]);
        });
        expect(seen).toEqual([
          ["a", ":directory"],
          ["html_parser.ts", ":file"],
        ]);
      },
    );
  });

  it("walk_up climbs to the root", () => {
    expect([...newLoader().walkUp("/a/b")]).toEqual(["/a/b", "/a", "/"]);
  });

  it("cname_for inflects and validates", async () => {
    const loader = newLoader();
    expect(await loader.cnameFor("html_parser", "/x/html-parser.ts")).toBe("HtmlParser");
    await expect(loader.cnameFor("1x", "/x/1x.ts")).rejects.toThrow(NameError);
    await expect(loader.cnameFor("1x", "/x/1x.ts")).rejects.toThrow(
      "wrong constant name 1x inferred by Zeitwerk::Inflector from file",
    );
  });
});

describe("Zeitwerk::Loader::Config", () => {
  afterEach(teardown);

  it("tag reads and writes through the included accessor", () => {
    const loader = newLoader();
    const lines: string[] = [];
    loader.tag = "main";
    loader.logger = (message) => lines.push(message);
    loader.log("hi");
    expect(lines).toEqual(["Zeitwerk@main: hi"]);
  });
});

describe("Zeitwerk::Cref on Object", () => {
  it("seats on TopLevel, keeps Object as mod, and is found by Map#delete_mod_cname", () => {
    const cref = new Cref(Object, "ZeitwerkTopLevelSeat");
    const map = new Map<number>();
    map.set(cref, 1);
    expect(cref.mod).toBe(Object);
    expect(map.deleteModCname(Object, "ZeitwerkTopLevelSeat")).toBe(1);

    cref.set(1);
    expect(cref.isDefined()).toBe(true);
    expect(cref.get()).toBe(1);
    cref.remove();
    expect(cref.isDefined()).toBe(false);
    expect(() => cref.get()).toThrow("uninitialized constant ZeitwerkTopLevelSeat");
    expect(() => cref.remove()).toThrow("constant Object::ZeitwerkTopLevelSeat not defined");
  });

  it("paths an anonymous namespace as Ruby interpolates nil", () => {
    expect(new Cref(class {}, "X").path()).toBe("::X");
  });

  it("push_dir accepts a plain-object module", async () => {
    const loader = newLoader();
    const mod = {};
    constSet(TopLevel, "ZeitwerkPlainNamespace", mod);
    await loader.pushDir(".", { namespace: mod });
    expect(loader.roots[File.expandPath(".")]).toBe(mod);
    teardown();
  });
});
