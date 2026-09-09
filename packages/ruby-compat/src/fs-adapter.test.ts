import { describe, test, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getFs } from "./fs-adapter.js";

const fsAdapterPath = fileURLToPath(new URL("./fs-adapter.ts", import.meta.url));

describe("fs-adapter auto-registration", () => {
  test("sync getFs resolves the node adapter under pure ESM", () => {
    const script = `
      if (typeof require !== "undefined") { console.error("not pure ESM"); process.exit(2); }
      const { getFs, getPath } = await import(${JSON.stringify(fsAdapterPath)});
      console.log(typeof getFs().readFileSync, typeof getPath().join);
    `;
    const out = execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
      encoding: "utf-8",
    });
    expect(out.trim()).toBe("function function");
  });
});

describe("FsAdapter#readFile", () => {
  test("is callable without a guard, and reads the file", async () => {
    const fs = getFs();
    const source = await fs.readFile(fsAdapterPath, "utf8");
    expect(source).toContain("export interface FsAdapter");
  });
});
