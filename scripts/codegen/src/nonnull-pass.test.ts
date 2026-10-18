import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nonNullPass } from "./nonnull-pass.js";

function run(src: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "nonnull-pass-"));
  writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true, target: "es2022", module: "nodenext" } }),
  );
  const file = path.join(dir, "a.ts");
  writeFileSync(file, src);
  nonNullPass(dir, path.join(dir, "tsconfig.json"));
  return readFileSync(file, "utf8");
}

const DECLS = `
declare function find(name: string): { local(n: number): number } | null;
declare function use(zone: { local(n: number): number }): void;
declare function maybe(zone?: { local(n: number): number } | null): void;
declare const name: string | null;
`;

describe("nonNullPass", () => {
  it("asserts a nullable argument into a non-null parameter", () => {
    expect(run(`${DECLS}use(find("Tokyo"));\n`)).toContain(`use(find("Tokyo")!);`);
  });

  it("leaves a parameter that admits null or is optional", () => {
    expect(run(`${DECLS}maybe(find("Tokyo"));\n`)).toContain(`maybe(find("Tokyo"));`);
  });

  it("asserts a nullable receiver of a member read", () => {
    expect(run(`${DECLS}find("UTC").local(1);\n`)).toContain(`find("UTC")!.local(1);`);
  });

  it("asserts a returned read but not a null literal", () => {
    const out = run(
      `${DECLS}function a(): string { return name; }\nfunction b(): string { return name ?? null; }\n`,
    );
    expect(out).toContain("return name!;");
    expect(out).toContain("return name ?? null;");
  });
});
