import { getFs, getPath } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import "../lib/index.js";

const FORBIDDEN_PACKAGES = new Set([
  "playwright",
  "playwright-core",
  "vite",
  "rollup",
  "vitest",
  "typescript",
  "typescript-5",
]);
const FORBIDDEN_MODULES =
  /\/action-dispatch\/system-t|\/server\/dev-server\.ts$|\/trailties\/src\/(?:command|commands|generators)(?:\/|\.ts$)/;
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
  const libRoot = (await getFs().exists(getPath().join(root, "lib"))) ? "lib/" : "src/";
  return getPath().join(root, built.replace(/^(\.\/)?dist\//, libRoot).replace(/\.js$/, ".ts"));
}

const fromRoot = (file: string): string =>
  file.startsWith(`${packagesRoot}/`) ? file.slice(packagesRoot.length + 1) : file;

async function reachableFrom(
  entries: string[],
): Promise<{ files: Set<string>; bare: Set<string>; chain: (to: string) => string }> {
  const files = new Set<string>();
  const bare = new Set<string>();
  const parent = new Map<string, string>();
  const queue = [...entries];
  const visit = (to: string, from: string): void => {
    if (!parent.has(to)) parent.set(to, from);
    queue.push(to);
  };
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (files.has(file)) continue;
    files.add(file);
    const source = await getFs().readFile(file, "utf8");
    for (const [, from, sideEffect, dynamic] of source.matchAll(SPECIFIER)) {
      const specifier = from ?? sideEffect ?? dynamic;
      if (specifier.startsWith(".")) {
        const relative = getPath().resolve(getPath().dirname(file), specifier);
        visit(relative.replace(/\.js$/, ".ts"), file);
        continue;
      }
      const workspace = await workspaceModule(specifier);
      if (workspace !== null) visit(workspace, file);
      else {
        const name = specifier.split("/")[0];
        bare.add(name);
        if (!parent.has(name)) parent.set(name, file);
      }
    }
  }
  const chain = (to: string): string => {
    const links = [to];
    while (parent.has(links[0])) links.unshift(parent.get(links[0])!);
    return links.map(fromRoot).join("\n -> ");
  };
  return { files, bare, chain };
}

describe("production boot", () => {
  it("reaches neither playwright nor vite", async () => {
    const trailties = getPath().join(packagesRoot, "trailties/src");
    const { files, bare, chain } = await reachableFrom([
      getPath().join(trailties, "index.ts"),
      getPath().join(trailties, "all.ts"),
      getPath().join(trailties, "server/index.ts"),
    ]);

    expect(files.size).toBeGreaterThan(100);
    expect([...bare].filter((name) => FORBIDDEN_PACKAGES.has(name)).map(chain)).toEqual([]);
    expect([...files].filter((file) => FORBIDDEN_MODULES.test(file)).map(chain)).toEqual([]);
  });

  it("keeps the system-testing surface on a subpath that resolves", async () => {
    const entry = await workspaceModule("@blazetrails/actionpack/system-testing");
    const { SystemTestCase, Driver, Server } = await import(entry!);

    expect(SystemTestCase.name).toBe("SystemTestCase");
    expect(Driver.name).toBe("Driver");
    expect(Server.name).toBe("Server");
  });
});
