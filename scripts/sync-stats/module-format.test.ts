import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Rationale for the marker this guards: scripts/sync-stats/package.json's
// "description". typecheck and vitest are both ESM, so nothing else notices.
const dir = fileURLToPath(new URL(".", import.meta.url));

describe("sync-stats module format", () => {
  it("declares ESM so tsx does not CJS-transform the workspace dist graph", async () => {
    const pkg: unknown = JSON.parse(await readFile(`${dir}package.json`, "utf8"));
    expect((pkg as { type?: string }).type).toBe("module");
  });

  it("still imports a workspace package, so the ESM marker is load-bearing", async () => {
    const source = await readFile(`${dir}sync.ts`, "utf8");
    expect(source).toMatch(/from "@blazetrails\//);
  });
});
