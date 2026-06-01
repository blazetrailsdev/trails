import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { init, detectPackageManager } from "./init.js";
import { generateManifest } from "./generate-manifest.js";

const EXPECTED = [
  "package.json",
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
    const scaffoldFiles = EXPECTED.filter((r) => r !== "package.json");
    for (const rel of scaffoldFiles) {
      expect(await readFile(join(root, rel), "utf8")).not.toMatch(/["']node:/);
    }
    // config/database.ts is the only file allowed to read process.env.
    for (const rel of scaffoldFiles.filter((r) => r !== "config/database.ts")) {
      expect(await readFile(join(root, rel), "utf8")).not.toMatch(/\bprocess\./);
    }
    // Config is keyed by TRAILS_ENV (not NODE_ENV) with the three Rails envs.
    const config = await readFile(join(root, "config/database.ts"), "utf8");
    expect(config).toContain("TRAILS_ENV");
    for (const env of ["development", "test", "production"]) expect(config).toContain(env);
  });

  it("never overwrites an existing scaffold file, so re-running is safe", async () => {
    await mkdir(join(root, "config"), { recursive: true });
    await writeFile(join(root, "config/database.ts"), "// mine\n", "utf8");

    const first = await init(root);
    expect(first.skipped).toContain("config/database.ts");
    expect(first.created).not.toContain("config/database.ts");
    expect(await readFile(join(root, "config/database.ts"), "utf8")).toBe("// mine\n");

    const second = await init(root);
    expect(second.created).toEqual([]);
    // package.json now updated (not created) on second run, so it won't be in skipped
    const expectedSkipped = EXPECTED.filter((r) => r !== "package.json");
    expect(second.skipped.sort()).toEqual([...expectedSkipped].sort());
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

  it("adds activerecord deps to an existing package.json without overwriting it", async () => {
    const original = { name: "my-app", version: "1.0.0", dependencies: { express: "^4.0.0" } };
    await writeFile(join(root, "package.json"), JSON.stringify(original, null, 2) + "\n", "utf8");

    const result = await init(root);
    expect(result.packageJsonUpdated).toBeDefined();
    expect(result.packageJsonUpdated!.added).toContain("@blazetrails/activerecord");
    expect(result.packageJsonUpdated!.added).toContain("@blazetrails/activerecord-cli");
    expect(result.packageJsonUpdated!.added).toContain("better-sqlite3");

    const raw = await readFile(join(root, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      name: string;
      version: string;
      dependencies: Record<string, string>;
    };
    // Original keys preserved
    expect(pkg.name).toBe("my-app");
    expect(pkg.version).toBe("1.0.0");
    expect(pkg.dependencies["express"]).toBe("^4.0.0");
    expect(pkg.dependencies["@blazetrails/activerecord"]).toBe("*");
  });

  it("skips silently when activerecord deps are already present in package.json", async () => {
    const original = {
      name: "my-app",
      dependencies: {
        "@blazetrails/activerecord": "^1.0.0",
        "@blazetrails/activerecord-cli": "*",
        "better-sqlite3": "^12.6.2",
      },
    };
    await writeFile(join(root, "package.json"), JSON.stringify(original, null, 2) + "\n", "utf8");

    const result = await init(root);
    expect(result.packageJsonUpdated!.added).toEqual([]);
    expect(result.packageJsonUpdated!.alreadyPresent).toContain("@blazetrails/activerecord");
  });

  it("preserves tab indentation in an existing package.json", async () => {
    const original = `{\n\t"name": "my-app",\n\t"dependencies": { "express": "^4.0.0" }\n}\n`;
    await writeFile(join(root, "package.json"), original, "utf8");
    await init(root);
    const raw = await readFile(join(root, "package.json"), "utf8");
    expect(raw).toMatch(/^\t/m);
  });

  it("scaffolds a fresh package.json when none exists", async () => {
    const result = await init(root);
    expect(result.created).toContain("package.json");
    expect(result.packageJsonUpdated).toBeUndefined();
    const raw = await readFile(join(root, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["@blazetrails/activerecord"]).toBe("*");
  });
});

describe("detectPackageManager", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ar-pm-"));
  });

  it("returns pnpm when pnpm-lock.yaml is present", async () => {
    await writeFile(join(root, "pnpm-lock.yaml"), "", "utf8");
    expect(await detectPackageManager(root)).toBe("pnpm");
  });

  it("returns yarn when yarn.lock is present", async () => {
    await writeFile(join(root, "yarn.lock"), "", "utf8");
    expect(await detectPackageManager(root)).toBe("yarn");
  });

  it("returns bun when bun.lockb is present", async () => {
    await writeFile(join(root, "bun.lockb"), "", "utf8");
    expect(await detectPackageManager(root)).toBe("bun");
  });

  it("returns bun when bun.lock (text format, Bun 1.2+) is present", async () => {
    await writeFile(join(root, "bun.lock"), "", "utf8");
    expect(await detectPackageManager(root)).toBe("bun");
  });

  it("returns npm when package-lock.json is present", async () => {
    await writeFile(join(root, "package-lock.json"), "", "utf8");
    expect(await detectPackageManager(root)).toBe("npm");
  });

  it("finds a lockfile in an ancestor directory (monorepo root)", async () => {
    // pnpm-lock.yaml lives at the workspace root — child packages share it
    await writeFile(join(root, "pnpm-lock.yaml"), "", "utf8");
    await writeFile(join(root, "package.json"), "{}", "utf8");
    const child = join(root, "packages", "my-pkg");
    await mkdir(child, { recursive: true });
    expect(await detectPackageManager(child)).toBe("pnpm");
  });

  it("packageManager field in package.json takes precedence over lockfile", async () => {
    // yarn.lock present, but packageManager says pnpm — field wins
    await writeFile(join(root, "yarn.lock"), "", "utf8");
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "x", packageManager: "pnpm@10.27.0" }, null, 2),
      "utf8",
    );
    expect(await detectPackageManager(root)).toBe("pnpm");
  });
});
