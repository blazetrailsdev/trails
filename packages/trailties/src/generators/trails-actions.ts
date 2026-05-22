// Trails-native template DSL — the JS/TS analogue of railties'
// Ruby-shape `gem`, `route`, `environment`, `initializer` actions.
//
// Kept separate from `actions.ts` (Rails-shape mirror) so `api:compare`
// stays clean. These actions mutate `package.json` and `src/config/*.ts`
// files in a trails app; they have no Ruby counterpart.

import { getFsAsync, getPathAsync, type FsAdapter } from "@blazetrails/activesupport";
import { assertNoRubySource } from "../template-builder/no-ruby-source.js";

type AsyncFs = FsAdapter & {
  readFile: NonNullable<FsAdapter["readFile"]>;
  writeFile: NonNullable<FsAdapter["writeFile"]>;
  mkdir: NonNullable<FsAdapter["mkdir"]>;
};

async function requireAsyncFs(needs: ReadonlyArray<keyof AsyncFs>): Promise<AsyncFs> {
  const fs = await getFsAsync();
  for (const m of needs) {
    if (typeof (fs as unknown as Record<string, unknown>)[m] !== "function") {
      throw new Error(
        `FsAdapter is missing required async method ${JSON.stringify(m)}; ` +
          `this action needs ${needs.map((n) => `async ${n}`).join(" + ")}`,
      );
    }
  }
  return fs as AsyncFs;
}

export interface TrailsActionsHost {
  cwd: string;
  output: (msg: string) => void;
}

export interface PkgOptions {
  dev?: boolean;
}

/**
 * Add a package to the application's `package.json`. The trails analogue of
 * railties' `gem` action — `version` defaults to `"*"`, and `{ dev: true }`
 * targets `devDependencies` instead of `dependencies`. Re-adding an existing
 * name overwrites its version.
 */
export async function pkg(
  this: TrailsActionsHost,
  name: string,
  version: string = "*",
  opts: PkgOptions = {},
): Promise<void> {
  if (name.trim() === "") {
    throw new Error(`package name must be non-empty, got ${JSON.stringify(name)}`);
  }
  const fs = await requireAsyncFs(["readFile", "writeFile"]);
  const path = await getPathAsync();
  const pkgPath = path.join(this.cwd, "package.json");
  const raw = await fs.readFile(pkgPath, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    const actual = parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed;
    throw new Error(`package.json must be a JSON object, got ${actual}`);
  }
  const json = parsed as Record<string, unknown>;
  if (name === "__proto__" || name === "constructor" || name === "prototype") {
    throw new Error(`invalid package name ${JSON.stringify(name)}`);
  }
  const key = opts.dev ? "devDependencies" : "dependencies";
  const existing = json[key];
  if (
    existing !== undefined &&
    (existing === null || typeof existing !== "object" || Array.isArray(existing))
  ) {
    const actual = existing === null ? "null" : Array.isArray(existing) ? "array" : typeof existing;
    throw new Error(`package.json "${key}" must be an object, got ${actual}`);
  }
  // Null-prototype target so a hostile name can't reach Object.prototype
  // even if the explicit reject above is ever bypassed.
  const deps: Record<string, string> = Object.assign(
    Object.create(null) as Record<string, string>,
    (existing as Record<string, string> | undefined) ?? {},
  );
  deps[name] = version;
  json[key] = deps;
  await fs.writeFile(pkgPath, JSON.stringify(json, null, 2) + "\n");
  this.output(`         pkg  ${name}`);
}

/**
 * Insert TS source at the `// routes` marker in `src/config/routes.ts`.
 * The trails analogue of railties' `route` action — caller supplies valid
 * TS; the marker is left in place so subsequent `route()` calls append
 * below the prior insertion.
 */
export async function route(this: TrailsActionsHost, tsCode: string): Promise<void> {
  assertNoRubySource(tsCode);
  await insertAtMarker(this, "src/config/routes.ts", "// routes", tsCode);
  this.output(`       route  ${summarize(tsCode)}`);
}

export interface EnvironmentOptions {
  env?: string;
}

/**
 * Insert TS source at the `// config` marker in `src/config/application.ts`,
 * or in `src/config/environments/$env.ts` when `env` is passed. The trails
 * analogue of railties' `environment` action.
 */
export async function environment(
  this: TrailsActionsHost,
  tsCode: string,
  options: EnvironmentOptions = {},
): Promise<void> {
  assertNoRubySource(tsCode);
  if (options.env !== undefined && !/^[a-z0-9_-]+$/i.test(options.env)) {
    throw new Error(
      `environment name must match /^[a-z0-9_-]+$/i, got ${JSON.stringify(options.env)}`,
    );
  }
  const relPath = options.env
    ? `src/config/environments/${options.env}.ts`
    : "src/config/application.ts";
  await insertAtMarker(this, relPath, "// config", tsCode);
  this.output(` environment  ${summarize(tsCode)}`);
}

/**
 * Write a new file under `src/config/initializers/`. The trails analogue of
 * railties' `initializer` action — `content` must be valid TS produced via
 * the `tsModule` builder (the `assertNoRubySource` check rejects raw Ruby
 * source like `class … end`). `filename` is a plain leaf name; path
 * separators and `..` segments are rejected.
 */
export async function initializer(
  this: TrailsActionsHost,
  filename: string,
  content: string,
): Promise<void> {
  if (
    filename === "" ||
    filename === "." ||
    filename === ".." ||
    filename.includes("/") ||
    filename.includes("\\")
  ) {
    throw new Error(`initializer filename must be a leaf name, got ${JSON.stringify(filename)}`);
  }
  assertNoRubySource(content);
  const fs = await requireAsyncFs(["mkdir", "writeFile"]);
  const path = await getPathAsync();
  const dir = path.join(this.cwd, "src/config/initializers");
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, filename);
  await fs.writeFile(dest, content.endsWith("\n") ? content : content + "\n");
  this.output(`      create  src/config/initializers/${filename}`);
}

async function insertAtMarker(
  host: TrailsActionsHost,
  relPath: string,
  marker: string,
  insertion: string,
): Promise<void> {
  const fs = await requireAsyncFs(["readFile", "writeFile"]);
  const path = await getPathAsync();
  const full = path.join(host.cwd, relPath);
  const existing = await fs.readFile(full, "utf-8");
  // Match the marker as a full line (`^<indent><marker>$`, multiline) so a
  // user-supplied block containing the marker substring inside other code
  // can't shadow the real marker line. Take the LAST match — every
  // insertion goes ABOVE the marker, so the original marker line is always
  // last in file.
  const re = new RegExp(`^([\\t ]*)${escapeRegExp(marker)}[\\t ]*$`, "gm");
  let match: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((match = re.exec(existing)) !== null) last = match;
  if (!last) {
    throw new Error(`marker ${JSON.stringify(marker)} not found in ${relPath}`);
  }
  const lineStart = last.index;
  const indent = last[1];
  const block = insertion
    .split("\n")
    .map((line) => (line.length === 0 ? line : indent + line))
    .join("\n");
  const text = block.endsWith("\n") ? block : block + "\n";
  const updated = existing.slice(0, lineStart) + text + existing.slice(lineStart);
  await fs.writeFile(full, updated);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function summarize(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? flat.slice(0, 57) + "..." : flat;
}
