import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { init } from "./init.js";

const EXPECTED = [
  "config/database.ts",
  "db/migrate/.gitkeep",
  "db/seeds.ts",
  "models/index.ts",
  "db.ts",
];

describe("ArInitTest", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ar-init-"));
  });

  it("scaffolds the expected file set", async () => {
    const { created, skipped } = await init(root);
    expect(created.sort()).toEqual([...EXPECTED].sort());
    expect(skipped).toEqual([]);
    for (const rel of EXPECTED) {
      await expect(readFile(join(root, rel), "utf8")).resolves.toBeTypeOf("string");
    }
  });

  it("generated files have no Node-only imports or process refs", async () => {
    await init(root);
    for (const rel of EXPECTED) {
      const body = await readFile(join(root, rel), "utf8");
      expect(body).not.toMatch(/["']node:/);
    }
    // config/database.ts is the only file allowed to read process.env.
    for (const rel of EXPECTED.filter((r) => r !== "config/database.ts")) {
      const body = await readFile(join(root, rel), "utf8");
      expect(body).not.toMatch(/\bprocess\./);
    }
  });

  it("config/database.ts is keyed by environment, not NODE_ENV", async () => {
    await init(root);
    const body = await readFile(join(root, "config/database.ts"), "utf8");
    expect(body).toContain("development");
    expect(body).toContain("test");
    expect(body).toContain("production");
    expect(body).toContain("TRAILS_ENV");
  });

  it("does not overwrite existing files", async () => {
    await mkdir(join(root, "config"), { recursive: true });
    await writeFile(join(root, "config/database.ts"), "// mine\n", "utf8");

    const { created, skipped } = await init(root);
    expect(skipped).toEqual(["config/database.ts"]);
    expect(created).not.toContain("config/database.ts");
    expect(await readFile(join(root, "config/database.ts"), "utf8")).toBe("// mine\n");
  });

  it("is idempotent — a second run re-skips every file", async () => {
    await init(root);
    const { created, skipped } = await init(root);
    expect(created).toEqual([]);
    expect(skipped.sort()).toEqual([...EXPECTED].sort());
  });
});
