import { describe, it, expect } from "vitest";
import ts from "typescript";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createTrailsProgram } from "./program.js";

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
    const fs = await import("node:fs");
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
