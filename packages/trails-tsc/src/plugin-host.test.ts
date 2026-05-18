import { describe, it, expect } from "vitest";
import ts from "typescript";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { buildPluginHost } from "./plugin-host.js";
import type { TscPlugin } from "./plugin.js";

function withTempFile(contents: string, ext: string, fn: (p: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-tsc-test-"));
  const file = path.join(dir, `fixture${ext}`);
  fs.writeFileSync(file, contents);
  try {
    fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const OPTS: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022 };

describe("buildPluginHost", () => {
  it("passes a non-matching file through unchanged", () => {
    const plugin: TscPlugin = {
      name: "noop",
      extensions: [".tse"],
      virtualize: () => ({ ts: "throw new Error('should not run')" }),
    };
    withTempFile("export const x = 1;\n", ".ts", (file) => {
      const host = buildPluginHost(OPTS, [plugin]);
      expect(host.readFile(file)).toBe("export const x = 1;\n");
      expect(host.getOriginalText(file)).toBeUndefined();
    });
  });

  it("substitutes virtualized text and exposes deltas + original", () => {
    const plugin: TscPlugin = {
      name: "prepend",
      extensions: [".ts"],
      virtualize: (_, source) => ({
        ts: `// injected\n${source}`,
        deltas: [{ insertedAtLine: -1, lineCount: 1 }],
      }),
    };
    withTempFile("export const x = 1;\n", ".ts", (file) => {
      const host = buildPluginHost(OPTS, [plugin]);
      expect(host.readFile(file)).toBe("// injected\nexport const x = 1;\n");
      expect(host.getOriginalText(file)).toBe("export const x = 1;\n");
      expect(host.getDeltasForFile(file)).toEqual([{ insertedAtLine: -1, lineCount: 1 }]);
    });
  });

  it("skips plugins that return null and falls through to the next", () => {
    const calls: string[] = [];
    const skip: TscPlugin = {
      name: "skip",
      extensions: [".ts"],
      virtualize: () => {
        calls.push("skip");
        return null;
      },
    };
    const win: TscPlugin = {
      name: "win",
      extensions: [".ts"],
      virtualize: (_, source) => {
        calls.push("win");
        return { ts: `/*x*/${source}` };
      },
    };
    withTempFile("export const x = 1;\n", ".ts", (file) => {
      const host = buildPluginHost(OPTS, [skip, win]);
      expect(host.readFile(file)).toBe("/*x*/export const x = 1;\n");
      expect(calls).toEqual(["skip", "win"]);
    });
  });
});
