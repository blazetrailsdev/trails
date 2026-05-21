import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ScaffoldGenerator } from "./scaffold-generator.js";
import { parseTs, assertNoRubySource } from "../../../template-builder/testing.js";

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-scaffold-emit-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function read(rel: string): string {
  return fs.readFileSync(path.join(tmpDir, rel), "utf-8");
}

describe("ScaffoldGenerator emit", () => {
  it("matches snapshot for the controller and validates as TS without Ruby", () => {
    new ScaffoldGenerator({ cwd: tmpDir, output: () => {} }).run("Post", [
      "title:string",
      "views:integer",
    ]);
    const src = read("src/app/controllers/posts-controller.ts");
    expect(src).toMatchSnapshot();
    expect(parseTs(src).diagnostics).toEqual([]);
    assertNoRubySource(src);
  });
});
