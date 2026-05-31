import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { init } from "./init.js";
import { generateManifest } from "./generate-manifest.js";

const EXPECTED = [
  "config/database.ts",
  "db/migrate/.gitkeep",
  "db/seeds.ts",
  "app/models/index.ts",
  "db.ts",
];

describe("ArInitTest", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ar-init-"));
  });

  it("scaffolds the expected file set, env-keyed and free of Node-only refs", async () => {
    const { created, skipped } = await init(root);
    expect(created.sort()).toEqual([...EXPECTED].sort());
    expect(skipped).toEqual([]);
    for (const rel of EXPECTED) {
      expect(await readFile(join(root, rel), "utf8")).not.toMatch(/["']node:/);
    }
    // config/database.ts is the only file allowed to read process.env.
    for (const rel of EXPECTED.filter((r) => r !== "config/database.ts")) {
      expect(await readFile(join(root, rel), "utf8")).not.toMatch(/\bprocess\./);
    }
    // Config is keyed by TRAILS_ENV (not NODE_ENV) with the three Rails envs.
    const config = await readFile(join(root, "config/database.ts"), "utf8");
    expect(config).toContain("TRAILS_ENV");
    for (const env of ["development", "test", "production"]) expect(config).toContain(env);
  });

  it("never overwrites an existing file, so re-running is safe", async () => {
    await mkdir(join(root, "config"), { recursive: true });
    await writeFile(join(root, "config/database.ts"), "// mine\n", "utf8");

    const first = await init(root);
    expect(first.skipped).toEqual(["config/database.ts"]);
    expect(first.created).not.toContain("config/database.ts");
    expect(await readFile(join(root, "config/database.ts"), "utf8")).toBe("// mine\n");

    const second = await init(root);
    expect(second.created).toEqual([]);
    expect(second.skipped.sort()).toEqual([...EXPECTED].sort());
  });

  it("scaffolds a manifest the generator considers already up to date", async () => {
    // init's starter models/index.ts must be byte-identical to what
    // `ar generate:manifest` emits for an empty models dir, or CI's
    // `--check` would flag drift the moment a project is scaffolded.
    await init(root);
    const result = await generateManifest(join(root, "app", "models"), { check: true });
    expect(result.changed).toBe(false);
  });

  it("surfaces real filesystem errors instead of silently skipping", async () => {
    // A plain file where init() needs to create the `config/` directory makes
    // mkdir fail — a real error that must propagate, not be swallowed as a skip.
    await writeFile(join(root, "config"), "not a dir\n", "utf8");
    await expect(init(root)).rejects.toThrow();
  });
});
