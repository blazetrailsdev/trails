import { beforeEach, describe, expect, it } from "vitest";
import { File, FileUtils, include } from "@blazetrails/ruby-compat";
import { Actions, type ActionsHost } from "../../lib/actions.js";
import { Group } from "../../lib/group.js";
import { capture, destinationRoot } from "../support/helper.js";

const compiledRoot = (): string => File.join(destinationRoot(), "compiled-source");

class CompiledGenerator extends Group {
  static {
    include(this, Actions);
  }

  static sourceRoot(): string {
    return File.expandPath(compiledRoot());
  }
}

type Generator = ActionsHost & { directory(...args: unknown[]): Promise<unknown> };

describe("Thor::Actions::Directory compiled template siblings", () => {
  beforeEach(async () => {
    FileUtils.rmRf(destinationRoot());
    await FileUtils.mkdirPAsync(File.join(compiledRoot(), "tpl"));
    for (const [name, body] of [
      ["page.tt", "page\n"],
      ["page.tt.js", 'export default function () {\n  return "page\\n";\n}\n'],
      ["page.tt.js.map", "{}\n"],
      ["page.tt.d.ts", "export {};\n"],
      ["lone.tt.js", "lone\n"],
    ])
      await File.writeAsync(File.join(compiledRoot(), "tpl", name), body);
  });

  async function invoke(): Promise<void> {
    const generator = new CompiledGenerator(
      [],
      {},
      {
        destinationRoot: destinationRoot(),
      },
    ) as unknown as Generator;
    await capture(":stdout", () => generator.directory("tpl", "out"));
  }

  it("skips a compiled sibling of a .tt template", async () => {
    await invoke();
    const out = File.join(destinationRoot(), "out");
    expect(File.read(File.join(out, "page"))).toBe("page\n");
    expect(File.isExist(File.join(out, "page.tt.js"))).toBe(false);
    expect(File.isExist(File.join(out, "page.tt.js.map"))).toBe(false);
    expect(File.isExist(File.join(out, "page.tt.d.ts"))).toBe(false);
  });

  it("copies a lone .tt.js with no .tt beside it", async () => {
    await invoke();
    expect(File.read(File.join(destinationRoot(), "out", "lone.tt.js"))).toBe("lone\n");
  });
});
