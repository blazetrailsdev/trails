import { LOAD_PATH } from "@blazetrails/ruby-compat";
import type { VirtualFs } from "./vfs.ts";

const DIST = "../../../../packages/trailties/dist/generators/";

const MODULES = import.meta.glob<Record<string, unknown>>(
  "../../../../packages/trailties/dist/generators/**/*-generator.js",
);
const FILES = import.meta.glob<string>(
  [
    "../../../../packages/trailties/dist/generators/**/templates/**",
    "../../../../packages/trailties/dist/generators/**/USAGE*",
    "!**/*%*",
    "!../../../../packages/trailties/dist/generators/trails/{app,plugin,generator}/**",
  ],
  { query: "?raw", import: "default" },
);

/** The global a served generator module reads its exports from. */
const LOADED = "__trailsGenerators";
const loaded: Record<string, Record<string, unknown>> = {};
Object.assign(globalThis, { [LOADED]: loaded });

const stubs = new Map<string, () => Promise<Record<string, unknown>>>();
let seated: Promise<string[]> | undefined;

/**
 * Seats trailties' generators in the virtual filesystem where Thor and
 * `Generators.lookup` look for them. A generator's templates and USAGE go
 * under `Base.baseRoot()`, the directory its `default_source_root` walks
 * from; its module goes under a `$LOAD_PATH` entry, as a file the runtime
 * answers with the bundled module's exports, so a generator is one class
 * whichever way it is reached. Answers the prefixes it seated.
 */
function seat(vfs: VirtualFs, root: string): Promise<string[]> {
  return (seated ??= (async () => {
    const loadDir = root.slice(0, root.lastIndexOf("/")) || "/";
    const lib = `${loadDir === "/" ? "" : loadDir}/generators/`;
    if (!LOAD_PATH.includes(loadDir)) LOAD_PATH.unshift(loadDir);
    for (const [key, load] of Object.entries(MODULES)) {
      const path = `${lib}${key.slice(DIST.length)}`;
      vfs.write(path, "", false);
      stubs.set(path, load);
    }
    await Promise.all(
      Object.entries(FILES).map(async ([key, load]) => {
        const path = `${root}/${key.slice(DIST.length)}`;
        vfs.write(path, await load(), false);
        if (path.endsWith(".tt.js")) vfs.write(path.slice(0, -3), "", false);
      }),
    );
    return [`${root}/`, lib];
  })());
}

/** The module source for a seated generator file, or `null` for any other path. */
export async function generatorModule(path: string): Promise<string | null> {
  const load = stubs.get(path);
  if (!load) return null;
  const mod = (loaded[path] ??= await load());
  const read = `globalThis[${JSON.stringify(LOADED)}][${JSON.stringify(path)}]`;
  return Object.keys(mod)
    .map((name) => `export const ${name} = ${read}[${JSON.stringify(name)}];`)
    .join("\n");
}

type Generators = {
  invoke(namespace: string, args: string[], config: { behavior: "invoke" }): Promise<void>;
  configureBang(config: unknown): void;
};
type Application = {
  config: { generators(): unknown };
  runGeneratorsBlocks(app: unknown): void;
};

let configured = false;

/**
 * Runs `bin/trails generate <args>` against the virtual filesystem and
 * answers every app file it wrote, with `null` for one it removed. `Engine#load_generators`'s `require
 * "rails/generators"` is this module's import of `generators.js`, since a
 * bundle cannot resolve that file by name at run time.
 */
export async function generate(
  vfs: VirtualFs,
  trails: { Generators?: Generators; application: Application },
  args: string[],
): Promise<Record<string, string | null>> {
  await import("../../../../packages/trailties/dist/generators.js");
  const { Base } = await import("../../../../packages/trailties/dist/generators/base.js");
  const generators = trails.Generators!;
  if (!configured) {
    trails.application.runGeneratorsBlocks(trails.application);
    generators.configureBang(trails.application.config.generators());
    configured = true;
  }
  const skip = [...(await seat(vfs, Base.baseRoot())), "/tmp/", "/log/", "/node_modules/"];
  const before = vfs.files();
  const [namespace, ...rest] = args;
  const cwd = vfs.cwd;
  try {
    await generators.invoke(namespace, rest, { behavior: "invoke" });
  } finally {
    vfs.cwd = cwd;
  }
  const after = vfs.files();
  const written: Record<string, string | null> = {};
  for (const path of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const data = after[path];
    if (before[path] === data || skip.some((prefix) => path.startsWith(prefix))) continue;
    written[path] =
      data === undefined ? null : typeof data === "string" ? data : new TextDecoder().decode(data);
  }
  return written;
}
