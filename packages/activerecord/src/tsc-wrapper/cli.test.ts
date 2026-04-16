import { describe, it, expect } from "vitest";
import ts from "typescript";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createTrailsProgram } from "./program.js";
import { remapDiagnostics } from "./remap.js";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(CURRENT_DIR, "__fixtures__");

describe("trails-tsc CLI — Phase 1b.1", () => {
  it("virtualizes a single-file model: post.title types as string with no declares", () => {
    const configPath = path.join(FIXTURES_DIR, "tsconfig.json");
    const { program } = createTrailsProgram(configPath);

    const diagnostics = [...program.getSemanticDiagnostics(), ...program.getSyntacticDiagnostics()];

    expect(diagnostics).toHaveLength(0);
  });

  it("consumer.ts types `post.title` as string, `post.published` as boolean", () => {
    const configPath = path.join(FIXTURES_DIR, "tsconfig.json");
    const { program } = createTrailsProgram(configPath);
    const checker = program.getTypeChecker();

    const consumerFile = program.getSourceFile(path.join(FIXTURES_DIR, "consumer.ts"));
    expect(consumerFile).toBeDefined();

    const probed: Record<string, string> = {};
    function visit(node: ts.Node): void {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const type = checker.getTypeAtLocation(node.initializer);
        probed[node.name.text] = checker.typeToString(type);
      }
      node.forEachChild(visit);
    }
    consumerFile!.forEachChild(visit);

    expect(probed["title"]).toBe("string");
    expect(probed["published"]).toBe("boolean");
  });

  it("non-Base files pass through unchanged (no virtualization)", () => {
    const configPath = path.join(FIXTURES_DIR, "tsconfig.json");
    const { program } = createTrailsProgram(configPath);

    const modelFile = program.getSourceFile(path.join(FIXTURES_DIR, "model.ts"));
    expect(modelFile).toBeDefined();
    // model.ts has no static block with `this.attribute(...)` calls
    // on a class that extends Base — it IS the Base. No declares injected.
    expect(modelFile!.text).not.toContain("declare title");
  });

  it("zero diagnostics across all diagnostic categories", () => {
    const configPath = path.join(FIXTURES_DIR, "tsconfig.json");
    const { program } = createTrailsProgram(configPath);
    const allDiags = [...ts.getPreEmitDiagnostics(program)];
    expect(allDiags).toHaveLength(0);
  });

  it("CLI binary exits 0 on clean fixture", async () => {
    const binPath = path.resolve(CURRENT_DIR, "../../dist/tsc-wrapper/cli.js");
    // Skip if dist hasn't been built (CI test jobs that skip `pnpm build`).
    // The programmatic API tests above cover the same behavior; this test
    // exercises the real binary entry path as an extra integration check.
    if (!fs.existsSync(binPath)) return;
    const { execFileSync } = await import("node:child_process");
    const result = execFileSync(
      "node",
      [binPath, "-p", path.join(FIXTURES_DIR, "tsconfig.json"), "--noEmit"],
      {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    // Clean exit — no output expected on success.
    expect(result).toBe("");
  });
});

describe("trails-tsc diagnostic remap — Phase 1b.2", () => {
  it("remaps error line from virtualized coordinates to original source line", () => {
    const configPath = path.join(FIXTURES_DIR, "tsconfig-with-error.json");
    const { program, host } = createTrailsProgram(configPath);
    const diagnostics = [...ts.getPreEmitDiagnostics(program)];

    // The error is TS2322 (Type 'string' is not assignable to type 'number')
    // on the line `const x: number = "not a number";`.
    // In the ORIGINAL file, that's line 9 (0-indexed: 8).
    // The virtualizer injects declares after the class `{`, shifting lines.
    expect(diagnostics.length).toBeGreaterThan(0);

    const errorDiag = diagnostics.find((d) => d.code === 2322);
    expect(errorDiag).toBeDefined();
    expect(errorDiag!.file).toBeDefined();

    // Virtualized line (shifted by injected declares)
    const virtualLine = errorDiag!.file!.getLineAndCharacterOfPosition(errorDiag!.start!).line;

    // Read the original source to find the real line
    const originalText = fs.readFileSync(path.join(FIXTURES_DIR, "post-with-error.ts"), "utf8");
    const originalLines = originalText.split("\n");
    const errorLineIdx = originalLines.findIndex((l) => l.includes('"not a number"'));
    expect(errorLineIdx).toBeGreaterThan(-1);

    // The virtualized line should be HIGHER than the original (shifted down)
    expect(virtualLine).toBeGreaterThan(errorLineIdx);

    // After remap, the reported line should match the original
    const remapped = remapDiagnostics(diagnostics, host);
    const remappedDiag = remapped.find((d) => d.code === 2322);
    expect(remappedDiag).toBeDefined();
    const remappedLine = remappedDiag!.file!.getLineAndCharacterOfPosition(
      remappedDiag!.start!,
    ).line;
    expect(remappedLine).toBe(errorLineIdx);
  });

  it("non-virtualized file diagnostics pass through unchanged", () => {
    const configPath = path.join(FIXTURES_DIR, "tsconfig-with-error.json");
    const { program, host } = createTrailsProgram(configPath);
    const diagnostics = [...ts.getPreEmitDiagnostics(program)];
    const remapped = remapDiagnostics(diagnostics, host);
    // Every diagnostic without deltas should have the same start position
    for (let i = 0; i < diagnostics.length; i++) {
      const d = diagnostics[i]!;
      if (!d.file) continue;
      const deltas = host.getDeltasForFile(path.resolve(d.file.fileName));
      if (!deltas || deltas.length === 0) {
        expect(remapped[i]!.start).toBe(d.start);
      }
    }
  });
});
