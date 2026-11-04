import { describe, expect, it } from "vitest";
import { File, getFs } from "@blazetrails/ruby-compat";
import { HealthController } from "./health-controller.js";
import { Trails } from "./trails.js";

const SRC = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

async function reachesTrails(entry: string): Promise<boolean> {
  const seen = new Set<string>();
  const queue = [File.join(SRC, entry)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !file.endsWith(".ts") || !(await getFs().exists(file))) continue;
    seen.add(file);
    const source = await getFs().readFile(file, "utf-8");
    for (const [, spec] of source.matchAll(/^(?:import|export) (?!type)[^;]*?"(\.[^"]+)"/gm)) {
      queue.push(File.expandPath(spec.replace(/\.js$/, ".ts"), File.dirname(file)));
    }
  }
  return seen.has(File.join(SRC, "trails.ts"));
}

describe("Trails::HealthController", () => {
  it("is seated by trails.ts, with no index import", () => {
    expect(Trails.HealthController).toBe(HealthController);
  });

  it.each(["bin.ts", "server-bin.ts"])("is reached from %s", async (entry) => {
    expect(await reachesTrails(entry)).toBe(true);
  });

  it("is reached from the commands export", async () => {
    const manifest = JSON.parse(await getFs().readFile(File.join(SRC, "../package.json"), "utf-8"));
    const entry = File.basename(manifest.exports["./commands"].default, ".js");
    expect(await reachesTrails(`${entry}.ts`)).toBe(true);
  });
});
