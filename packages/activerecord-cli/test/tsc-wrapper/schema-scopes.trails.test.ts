import { describe, expect, test, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadSchemaColumns, loadSchemaScopes } from "../../lib/tsc-wrapper/cli.js";

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "scopes-")), "s.json");
fs.writeFileSync(file, JSON.stringify({ posts: { title: "string" } }));

function exits(run: () => unknown): void {
  const exit = vi.spyOn(process, "exit").mockImplementation(((code: number) => {
    throw new Error(`exit ${code}`);
  }) as never);
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  expect(run).toThrow("exit 1");
  exit.mockRestore();
  stderr.mockRestore();
}

describe("--schema <path>=<Base>", () => {
  test("keys the file by base and keeps it out of the loose columns", () => {
    const args = ["--schema", `${file}=Stats`];
    expect(loadSchemaScopes(args)?.get("Stats")).toEqual({ posts: { title: "string" } });
    expect(loadSchemaColumns(args)).toBeUndefined();
  });

  test("reads a path holding = as a path", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a=b-"));
    const odd = path.join(dir, "s.json");
    fs.writeFileSync(odd, "{}");
    expect(loadSchemaScopes(["--schema", odd])).toBeUndefined();
  });

  test("refuses an empty base", () => {
    exits(() => loadSchemaScopes(["--schema", `${file}=`]));
  });

  test("refuses two files for one base", () => {
    exits(() => loadSchemaScopes(["--schema", `${file}=Stats`, "--schema", `${file}=Stats`]));
  });
});
