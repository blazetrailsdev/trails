import { Dir } from "@blazetrails/ruby-compat";
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
