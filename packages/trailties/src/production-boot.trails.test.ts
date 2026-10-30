import { getFs, getPath } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import "./index.js";

const FORBIDDEN_PACKAGES = new Set(["playwright", "playwright-core", "vite", "rollup", "vitest"]);
const FORBIDDEN_MODULES = /\/action-dispatch\/system-t|\/server\/dev-server\.ts$/;
const SPECIFIER =
  /^\s*(?:import|export)\b(?!\s+type\b)[^;]*?from\s+"([^"]+)"|^\s*import\s+"([^"]+)"|\bimport\(\s*"([^"]+)"\s*\)/gm;

const packagesRoot = getPath().resolve(import.meta.dirname, "../..");

async function workspaceModule(specifier: string): Promise<string | null> {
  const [, name, subpath] = /^@blazetrails\/([^/]+)(?:\/(.+))?$/.exec(specifier) ?? [];
  if (name === undefined) return null;
  const root = getPath().join(packagesRoot, name);
  const pkg = JSON.parse(await getFs().readFile(getPath().join(root, "package.json"), "utf8")) as {
    main?: string;
    exports?: Record<string, string | { default: string }>;
  };
  const target = pkg.exports?.[subpath ? `./${subpath}` : "."] ?? pkg.main!;
  const built = typeof target === "string" ? target : target.default;
  return getPath().join(root, built.replace(/^(\.\/)?dist\//, "src/").replace(/\.js$/, ".ts"));
}

async function reachableFrom(
  entries: string[],
): Promise<{ files: Set<string>; bare: Set<string> }> {
  const files = new Set<string>();
  const bare = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    const source = await getFs().readFile(file, "utf8");
    for (const [, from, sideEffect, dynamic] of source.matchAll(SPECIFIER)) {
      const specifier = from ?? sideEffect ?? dynamic;
      if (specifier.startsWith(".")) {
        const relative = getPath().resolve(getPath().dirname(file), specifier);
        queue.push(relative.replace(/\.js$/, ".ts"));
        continue;
      }
      const workspace = await workspaceModule(specifier);
      if (workspace !== null) queue.push(workspace);
      else bare.add(specifier.split("/")[0]);
    }
  }
  return { files, bare };
}

describe("production boot", () => {
  it("reaches neither playwright nor vite", async () => {
    const trailties = getPath().join(packagesRoot, "trailties/src");
    const { files, bare } = await reachableFrom([
      getPath().join(trailties, "index.ts"),
      getPath().join(trailties, "all.ts"),
    ]);

    expect(files.size).toBeGreaterThan(100);
    expect([...bare].filter((name) => FORBIDDEN_PACKAGES.has(name))).toEqual([]);
    expect([...files].filter((file) => FORBIDDEN_MODULES.test(file))).toEqual([]);
  });

  it("keeps the system-testing surface on a subpath that resolves", async () => {
    const entry = await workspaceModule("@blazetrails/actionpack/system-testing");
    const { SystemTestCase, Driver, Server } = await import(entry!);

    expect(SystemTestCase.name).toBe("SystemTestCase");
    expect(Driver.name).toBe("Driver");
    expect(Server.name).toBe("Server");
  });
});
