import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { typePass } from "./type-pass.js";

function run(src: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "type-pass-"));
  writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true, target: "es2022", module: "nodenext" } }),
  );
  const file = path.join(dir, "a.ts");
  writeFileSync(file, src);
  typePass(dir, path.join(dir, "tsconfig.json"));
  return readFileSync(file, "utf8");
}

describe("typePass", () => {
  it("types a parameter by what its call sites pass", { timeout: 60000 }, () => {
    const out = run(`export function f(x: any) {\n  return x;\n}\nf("a");\nf(1);\n`);
    expect(out).toContain("function f(x: string | number)");
  });

  it("types a module function's this by its receivers", { timeout: 60000 }, () => {
    const out = run(
      `export function m(this: any) {\n  return this.n;\n}\nexport class K {\n  n = 1;\n  m = m;\n}\nnew K().m();\n`,
    );
    expect(out).toContain("function m(this: K)");
  });

  it(
    "leaves an uncalled parameter unknown and an any return to inference",
    { timeout: 60000 },
    () => {
      const out = run(`export function g(x: any): any {\n  return 1;\n}\n`);
      expect(out).toContain("function g(x: unknown) {");
    },
  );

  it("drops an as-any cast and a local's any", { timeout: 60000 }, () => {
    const out = run(`export function h() {\n  const v: any = 1;\n  return (v as any) + 1;\n}\n`);
    expect(out).not.toMatch(/\bany\b/);
    expect(out).toContain("const v = 1;");
  });
});
