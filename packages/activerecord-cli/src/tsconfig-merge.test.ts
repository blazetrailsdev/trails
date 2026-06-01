import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { init } from "./init.js";
import { mergeTsconfig, FRESH_TSCONFIG } from "./tsconfig-merge.js";

describe("mergeTsconfig", () => {
  it("adds missing AR compilerOptions to a minimal existing tsconfig", () => {
    const existing = JSON.stringify({ compilerOptions: { outDir: "dist" } }, null, 2) + "\n";
    const result = mergeTsconfig(existing);
    const cfg = JSON.parse(result.content) as {
      compilerOptions: Record<string, unknown>;
    };
    expect(cfg.compilerOptions["target"]).toBe("ES2022");
    expect(cfg.compilerOptions["strict"]).toBe(true);
    expect(cfg.compilerOptions["esModuleInterop"]).toBe(true);
    expect(cfg.compilerOptions["skipLibCheck"]).toBe(true);
    expect(result.added).toContain("target");
    expect(result.added).toContain("strict");
    // outDir was already present — not in added
    expect(result.added).not.toContain("outDir");
  });

  it("does not overwrite conflicting values and reports them", () => {
    const existing =
      JSON.stringify({ compilerOptions: { target: "ES5", strict: false } }, null, 2) + "\n";
    const result = mergeTsconfig(existing);
    const cfg = JSON.parse(result.content) as { compilerOptions: Record<string, unknown> };
    // Existing conflicting values preserved
    expect(cfg.compilerOptions["target"]).toBe("ES5");
    expect(cfg.compilerOptions["strict"]).toBe(false);
    // Conflicts reported
    expect(result.conflicts.find((c) => c.key === "target")).toMatchObject({
      existing: "ES5",
      required: "ES2022",
    });
    expect(result.conflicts.find((c) => c.key === "strict")).toMatchObject({
      existing: false,
      required: true,
    });
  });

  it("parses JSONC (comments + trailing commas) without throwing", () => {
    const jsonc = `{
  // A comment
  "compilerOptions": {
    "outDir": "dist", // trailing comma
  }
}`;
    expect(() => mergeTsconfig(jsonc)).not.toThrow();
    const result = mergeTsconfig(jsonc);
    const cfg = JSON.parse(result.content) as { compilerOptions: Record<string, unknown> };
    expect(cfg.compilerOptions["target"]).toBe("ES2022");
  });

  it("appends missing include globs and leaves existing ones alone", () => {
    const existing =
      JSON.stringify({ compilerOptions: {}, include: ["./**/*.ts"] }, null, 2) + "\n";
    const result = mergeTsconfig(existing);
    const cfg = JSON.parse(result.content) as { include: string[] };
    expect(cfg.include).toContain("app/models/**/*.ts");
    expect(cfg.include).toContain("db/migrate/**/*.ts");
    expect(cfg.include).toContain("./**/*.ts");
    expect(result.includesAppended).toContain("app/models/**/*.ts");
    expect(result.includesAppended).toContain("db/migrate/**/*.ts");
  });

  it("does not duplicate include globs already present", () => {
    const existing =
      JSON.stringify(
        { compilerOptions: {}, include: ["app/models/**/*.ts", "db/migrate/**/*.ts"] },
        null,
        2,
      ) + "\n";
    const result = mergeTsconfig(existing);
    const cfg = JSON.parse(result.content) as { include: string[] };
    expect(cfg.include.filter((g) => g === "app/models/**/*.ts")).toHaveLength(1);
    expect(result.includesAppended).toEqual([]);
  });

  it("adds trails-tsc plugin when plugins array is absent", () => {
    const existing = JSON.stringify({ compilerOptions: {} }, null, 2) + "\n";
    const result = mergeTsconfig(existing);
    const cfg = JSON.parse(result.content) as {
      compilerOptions: { plugins?: { name: string }[] };
    };
    expect(cfg.compilerOptions.plugins).toContainEqual({
      name: "@blazetrails/trails-tsc/ts-plugin",
    });
    expect(result.pluginAdded).toBe(true);
  });

  it("appends trails-tsc plugin when plugins array exists but lacks it", () => {
    const existing =
      JSON.stringify({ compilerOptions: { plugins: [{ name: "other-plugin" }] } }, null, 2) + "\n";
    const result = mergeTsconfig(existing);
    const cfg = JSON.parse(result.content) as {
      compilerOptions: { plugins?: { name: string }[] };
    };
    expect(cfg.compilerOptions.plugins).toContainEqual({
      name: "@blazetrails/trails-tsc/ts-plugin",
    });
    expect(cfg.compilerOptions.plugins).toContainEqual({ name: "other-plugin" });
    expect(result.pluginAdded).toBe(true);
  });

  it("does not duplicate trails-tsc plugin when already present", () => {
    const existing =
      JSON.stringify(
        { compilerOptions: { plugins: [{ name: "@blazetrails/trails-tsc/ts-plugin" }] } },
        null,
        2,
      ) + "\n";
    const result = mergeTsconfig(existing);
    const cfg = JSON.parse(result.content) as {
      compilerOptions: { plugins?: { name: string }[] };
    };
    const count = (cfg.compilerOptions.plugins ?? []).filter(
      (p) => p.name === "@blazetrails/trails-tsc/ts-plugin",
    ).length;
    expect(count).toBe(1);
    expect(result.pluginAdded).toBe(false);
  });
});

describe("FRESH_TSCONFIG", () => {
  it("is valid JSON containing all AR-required options", () => {
    const cfg = JSON.parse(FRESH_TSCONFIG) as {
      compilerOptions: Record<string, unknown>;
      include: string[];
    };
    expect(cfg.compilerOptions["target"]).toBe("ES2022");
    expect(cfg.compilerOptions["module"]).toBe("Node16");
    expect(cfg.compilerOptions["strict"]).toBe(true);
    expect(cfg.compilerOptions["esModuleInterop"]).toBe(true);
    expect(cfg.compilerOptions["skipLibCheck"]).toBe(true);
  });
});

describe("ar init tsconfig integration", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ar-init-tsconfig-"));
  });

  it("scaffolds a fresh tsconfig.json when none exists", async () => {
    const result = await init(root);
    expect(result.created).toContain("tsconfig.json");
    expect(result.tsconfigMerged).toBeUndefined();
    const raw = await readFile(join(root, "tsconfig.json"), "utf8");
    const cfg = JSON.parse(raw) as { compilerOptions: Record<string, unknown> };
    expect(cfg.compilerOptions["target"]).toBe("ES2022");
  });

  it("merges AR settings into an existing tsconfig.json without overwriting it", async () => {
    const existing = JSON.stringify({ compilerOptions: { outDir: "dist" } }, null, 2) + "\n";
    await writeFile(join(root, "tsconfig.json"), existing, "utf8");

    const result = await init(root);
    expect(result.tsconfigMerged).toBeDefined();
    expect(result.created).not.toContain("tsconfig.json");

    const raw = await readFile(join(root, "tsconfig.json"), "utf8");
    const cfg = JSON.parse(raw) as { compilerOptions: Record<string, unknown> };
    expect(cfg.compilerOptions["target"]).toBe("ES2022");
    expect(cfg.compilerOptions["outDir"]).toBe("dist");
  });

  it("reports conflicts for a tsconfig with incompatible target but does not overwrite", async () => {
    const existing = JSON.stringify({ compilerOptions: { target: "ES5" } }, null, 2) + "\n";
    await writeFile(join(root, "tsconfig.json"), existing, "utf8");

    const result = await init(root);
    expect(result.tsconfigMerged!.conflicts).toContainEqual(
      expect.objectContaining({ key: "target", existing: "ES5" }),
    );
    const raw = await readFile(join(root, "tsconfig.json"), "utf8");
    const cfg = JSON.parse(raw) as { compilerOptions: Record<string, unknown> };
    expect(cfg.compilerOptions["target"]).toBe("ES5");
  });

  it("appends missing include globs to existing tsconfig", async () => {
    const existing =
      JSON.stringify({ compilerOptions: {}, include: ["src/**/*.ts"] }, null, 2) + "\n";
    await writeFile(join(root, "tsconfig.json"), existing, "utf8");

    await init(root);
    const raw = await readFile(join(root, "tsconfig.json"), "utf8");
    const cfg = JSON.parse(raw) as { include: string[] };
    expect(cfg.include).toContain("app/models/**/*.ts");
    expect(cfg.include).toContain("db/migrate/**/*.ts");
    expect(cfg.include).toContain("src/**/*.ts");
  });

  it("does not rewrite an already-compliant tsconfig (preserves mtime)", async () => {
    const compliant =
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "Node16",
            moduleResolution: "Node16",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            plugins: [{ name: "@blazetrails/trails-tsc/ts-plugin" }],
          },
          include: ["app/models/**/*.ts", "db/migrate/**/*.ts"],
        },
        null,
        2,
      ) + "\n";
    await writeFile(join(root, "tsconfig.json"), compliant, "utf8");
    const { mtimeMs: before } = await import("fs/promises").then((fs) =>
      fs.stat(join(root, "tsconfig.json")),
    );

    await init(root);

    const { mtimeMs: after } = await import("fs/promises").then((fs) =>
      fs.stat(join(root, "tsconfig.json")),
    );
    expect(after).toBe(before);
  });

  it("overwrites tsconfig wholesale when --force is set", async () => {
    const existing = JSON.stringify({ compilerOptions: { target: "ES5" } }, null, 2) + "\n";
    await writeFile(join(root, "tsconfig.json"), existing, "utf8");

    const result = await init(root, { force: true });
    expect(result.tsconfigMerged).toBeUndefined();
    const raw = await readFile(join(root, "tsconfig.json"), "utf8");
    expect(raw).toBe(FRESH_TSCONFIG);
  });
});
