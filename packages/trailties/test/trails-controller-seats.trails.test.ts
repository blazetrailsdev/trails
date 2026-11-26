import { describe, expect, it } from "vitest";
import { File } from "@blazetrails/ruby-compat/file";
import { getFs } from "@blazetrails/ruby-compat/fs-adapter";
import { rbModName } from "@blazetrails/ruby-compat/object";
import { HealthController } from "../lib/health-controller.js";
import { Trails } from "../lib/trails.js";

const SRC = File.dirname(decodeURIComponent(new URL("../lib/x", import.meta.url).pathname));

async function reachesTrails(entry: string): Promise<boolean> {
  const seen = new Set<string>();
  const queue = [File.join(SRC, entry)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !file.endsWith(".ts") || !(await getFs().exists(file))) continue;
    seen.add(file);
    const source = await getFs().readFile(file, "utf-8");
    for (const [, spec] of source.matchAll(
      /^(?:(?:import|export) (?!type)[^;]*?|await import\()"(\.[^"]+)"/gm,
    )) {
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

describe("Trails' autoloaded constants", () => {
  it.each([
    ["../lib/application-controller.js", "ApplicationController"],
    ["../lib/health-controller.js", "HealthController"],
    ["../lib/info.js", "Info"],
    ["../lib/info-controller.js", "InfoController"],
    ["../lib/mailers-controller.js", "MailersController"],
    ["../lib/pwa-controller.js", "PwaController"],
    ["../lib/welcome-controller.js", "WelcomeController"],
  ])("%s answers Trails::%s", async (path, name) => {
    const mod = (await import(path)) as Record<string, object>;
    expect(rbModName(mod[name])).toBe(`Trails::${name}`);
  });
});
