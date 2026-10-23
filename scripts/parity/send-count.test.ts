import { describe, it, expect } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import { SEND_PATTERN, ROOT_DIR, countLines, exceedances, measure, total } from "./send-count.js";

const run = promisify(execFile);

describe("countLines", () => {
  it("counts a literal name and skips a computed one", () => {
    expect(countLines('rbFSend(app, "call", env);\nrbFSend(recv, name);\nok\n')).toBe(1);
    expect(countLines('rbFPublicSend(record, "write", v);\n')).toBe(1);
  });

  it("counts a nested call in the receiver slot", () => {
    expect(countLines('rbFSend(File.extname(f).toLowerCase(), "delete", ".")\n')).toBe(1);
  });

  it("counts a receiver whose own call holds a comma", () => {
    expect(countLines('rbFSend(this.databaseAdapterFor(dbConfig, ...args), "create");\n')).toBe(1);
  });

  it("skips a computed name followed by a string-literal argument", () => {
    expect(countLines('rbFSend(recv, name, "x");\n')).toBe(0);
  });

  it("skips a computed name whose receiver call holds a string", () => {
    expect(countLines('rbFSend(foo(a, "x"), name);\n')).toBe(0);
  });

  it("matches a long parenthesised receiver without backtracking", () => {
    const line = `rbFSend(${"(x)".repeat(40)}`;
    const started = Date.now();
    expect(countLines(line + "\n")).toBe(0);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("counts matching lines, not matches", () => {
    expect(countLines('rbFSend(a, "x") + rbFSend(b, "y")\n')).toBe(1);
  });

  it("skips a name held in a variable or a template", () => {
    expect(countLines("rbFSend(record, `${inverse.name}=`, owner);\n")).toBe(0);
    expect(countLines("rbFSend(this, dispatchMethod, object, collector);\n")).toBe(0);
  });
});

describe("exceedances", () => {
  it("flags a file above its base count and a file new at a non-zero count", () => {
    expect(exceedances({ "a/src/x.ts": 2 }, { "a/src/x.ts": 3 })).toEqual([
      { file: "a/src/x.ts", base: 2, current: 3 },
    ]);
    expect(exceedances({}, { "a/src/new.ts": 1 })).toEqual([
      { file: "a/src/new.ts", base: 0, current: 1 },
    ]);
  });

  it("passes a file at or below its base count", () => {
    expect(exceedances({ "a/src/x.ts": 2 }, { "a/src/x.ts": 2 })).toEqual([]);
    expect(exceedances({ "a/src/x.ts": 2 }, { "a/src/x.ts": 1 })).toEqual([]);
    expect(exceedances({ "a/src/gone.ts": 2 }, {})).toEqual([]);
  });
});

describe("measure", () => {
  it("reads the same per-file counts as grep over the working tree", async () => {
    const counts = await measure();
    const { stdout } = await run(
      "git",
      ["grep", "-c", "-E", SEND_PATTERN, "--", "packages/*/src/*.ts", ":!*.test.ts", ":!*/dist/*"],
      { cwd: ROOT_DIR, maxBuffer: 1 << 26 },
    );
    let grepTotal = 0;
    for (const line of stdout.split("\n")) {
      if (line === "") continue;
      grepTotal += Number(line.slice(line.lastIndexOf(":") + 1));
    }
    expect(total(counts)).toBe(grepTotal);
  });

  it("excludes test files", async () => {
    const counts = await measure();
    expect(Object.keys(counts).filter((f) => f.endsWith(".test.ts"))).toEqual([]);
  });
});
