import { describe, test, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const fsAdapterPath = fileURLToPath(new URL("./fs-adapter.ts", import.meta.url));

describe("fs-adapter auto-registration", () => {
  test("sync getFs resolves the node adapter under pure ESM", () => {
    // Vitest's module runner supplies a `require` shim, so the sync path only
    // proves anything in a real ESM child process where `require` is absent.
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
