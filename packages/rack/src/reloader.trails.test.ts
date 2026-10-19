import { afterEach, describe, expect, it } from "vitest";
import { Tempfile, rbGvSet, rbObjIvarGet, rbObjIvarSet } from "@blazetrails/ruby-compat";
import { Reloader } from "./reloader.js";

describe("Rack::Reloader", () => {
  let tempfile: Tempfile | null = null;

  afterEach(() => {
    tempfile?.closeBang();
    tempfile = null;
    rbGvSet("$0", null);
    rbGvSet("$LOADED_FEATURES", null);
  });

  function feature(): string {
    tempfile = Tempfile.new(["reloader", ".mjs"]);
    tempfile.write("export const Reloaded = 1;\n");
    tempfile.flush();
    const path = tempfile.path()!;
    rbGvSet("$0", path);
    rbGvSet("$LOADED_FEATURES", [path]);
    return path;
  }

  it("records the mtime of each loaded feature without loading it", async () => {
    const path = feature();
    const lines: string[] = [];
    const reloader = new Reloader({ call: () => [200, {}, []] });
    await reloader.reloadBang({ write: (s: string) => lines.push(s) });
    expect(Object.keys(rbObjIvarGet(reloader, "@mtimes") as object)).toEqual([path]);
    expect(lines).toEqual([]);
  });

  it("loads a feature whose mtime moved forward", async () => {
    const path = feature();
    const lines: string[] = [];
    const reloader = new Reloader({ call: () => [200, {}, []] });
    (rbObjIvarGet(reloader, "@mtimes") as Record<string, Date>)[path] = new Date(0);
    await reloader.reloadBang({ write: (s: string) => lines.push(s) });
    expect(lines.join("")).toBe(`Reloader: reloaded \`${path}'\n`);
  });

  it("skips the reload during the cooldown", async () => {
    feature();
    const reloader = new Reloader({ call: () => "called" }, 60);
    rbObjIvarSet(reloader, "@last", 0);
    expect(await reloader.call({})).toBe("called");
    const last = rbObjIvarGet(reloader, "@last");
    expect(last).not.toBe(0);
    expect(await reloader.call({})).toBe("called");
    expect(rbObjIvarGet(reloader, "@last")).toBe(last);
  });
});
