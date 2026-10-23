import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const EDGE = /(?:import|export)\b[^;]*?from\s*["'](\.[^"']+)["']|import\s*\(\s*["'](\.[^"']+)["']/g;
const BARE =
  /(?:import|export)\b[^;]*?from\s*["']([^."'][^"']*)["']|import\s*\(\s*["']([^."'][^"']*)["']/g;
const TYPE_ONLY = /^\s*(?:import|export)\s+type\b/;

function resolve(from: string, spec: string): string | null {
  const base = path.resolve(path.dirname(from), spec).replace(/\.js$/, "");
  for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function graph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [path.join(SRC, entry)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(EDGE)) {
      if (TYPE_ONLY.test(m[0])) continue;
      const next = resolve(file, m[1] ?? m[2]);
      if (next) queue.push(next);
    }
    for (const m of src.matchAll(BARE)) {
      if (TYPE_ONLY.test(m[0])) continue;
      const spec = m[1] ?? m[2];
      if (!spec.startsWith("node:")) packages.add(spec);
    }
  }

  return { files, packages };
}

const rel = (files: Set<string>): string[] => [...files].map((f) => path.relative(SRC, f)).sort();

describe("the production server entry point", () => {
  const server = graph("server/index.ts");

  it("cannot reach commander, so no command table is in the graph", () => {
    expect([...server.packages].filter((p) => p === "commander")).toEqual([]);
  });

  it("cannot reach vite or the other build tooling", () => {
    const tooling = [...server.packages].filter((p) =>
      /^(vite|rollup|esbuild|vitest)($|\/)/.test(p),
    );
    expect(tooling).toEqual([]);
  });

  it("cannot reach the dev server, which is what puts vite in the graph", () => {
    expect(rel(server.files).filter((f) => f.includes("dev-server"))).toEqual([]);
  });

  it("cannot reach any command, including the one it shares `serve` with", () => {
    expect(rel(server.files).filter((f) => f.startsWith("commands/"))).toEqual([]);
  });

  it("cannot reach the generator that imports vite, however it reaches the others", () => {
    const generators = rel(server.files).filter((f) => f.startsWith("generators/"));
    expect(generators).not.toEqual([]);
    expect(generators).not.toContain("generators/app-generator.ts");
  });

  it("is not reached by the CLI's server command, which stays the ported file", () => {
    const command = graph("commands/server.ts");
    expect(rel(command.files)).not.toContain("server/boot.ts");
  });

  it("still exposes Trails, which the `.` entry point only offers through the CLI", async () => {
    const entry = await import("./index.js");
    expect(typeof entry.serve).toBe("function");
    expect(entry.Trails).toBeTruthy();
  }, 30_000);

  it("keeps rails.ts's generators import type-only, which is all that holds vite out", () => {
    const rails = fs.readFileSync(path.join(SRC, "rails.ts"), "utf8");
    const edges = [...rails.matchAll(/^.*from\s*["']\.\/generators\/.*$/gm)].map((m) =>
      m[0].trim(),
    );
    expect(edges).not.toEqual([]);
    for (const edge of edges) expect(edge).toMatch(/^import type\b/);
  });

  it("and the bin reaches nothing the entry point does not", () => {
    const bin = graph("server-bin.ts");
    expect([...bin.packages].filter((p) => p === "commander")).toEqual([]);
    expect(rel(bin.files).filter((f) => f.startsWith("commands/"))).toEqual([]);
  });
});
