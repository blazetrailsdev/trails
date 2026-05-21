/**
 * `trails-tsc-views build` core — Phase 2c-a (plan §2 / actionview-100 §2c).
 *
 * Walks `app/views/**\/*.tse`, runs the in-tree `.tse` virtualizer
 * (typed shim) + tse-compiler `compileJs` (runtime ES module) per
 * file, mirrors output under `.trails/views/`, and emits
 * `.trails/views-manifest.ts` — a lazy-thunk registry per Decision 7.
 *
 * The CLI is published as `trails-tsc-views` (not `trails-tsc`) because
 * activerecord already ships a `trails-tsc` bin. Unification is a
 * follow-up. Watch mode, the LSP plugin, and the postinstall hook are
 * deferred to 2c-b / 2c-c.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { compileJs } from "@blazetrails/tse-compiler";
import { virtualizeTse } from "./plugins/tse.js";

export interface BuildViewsOptions {
  cwd?: string;
  /** Source directory holding `**\/*.tse`. Default `app/views`. */
  viewsDir?: string;
  /** Mirror root. Default `.trails`. Outputs land under `<outDir>/views/`. */
  outDir?: string;
}

export interface BuildViewsResult {
  count: number;
  /** `.tse` paths relative to `viewsDir`, in POSIX form, sorted. */
  files: readonly string[];
}

export function buildViews(opts: BuildViewsOptions = {}): BuildViewsResult {
  const cwd = opts.cwd ?? process.cwd();
  const viewsDir = path.resolve(cwd, opts.viewsDir ?? "app/views");
  const outDir = path.resolve(cwd, opts.outDir ?? ".trails");
  const outViews = path.join(outDir, "views");
  const files = walkTse(viewsDir);
  // Safety: refuse to wipe a mirror dir that escapes `cwd`. A mistaken
  // `--out /` would otherwise resolve `outViews` to `/views` and recurse
  // into shared system state. Two checks:
  //
  //   (1) Lexical — outViews resolves under cwd. Catches obvious escapes
  //       (`--out /tmp/x`, `--out ../sibling`).
  //   (2) Symlink-aware — realpath of the deepest existing ancestor of
  //       outViews stays under realpath(cwd). A symlinked `.trails`
  //       (or any ancestor) pointing outside the project would pass the
  //       lexical check but `fs.rmSync` follows symlinks and could
  //       delete shared state. We compare realpaths because `cwd` itself
  //       may legitimately be reached through a symlink.
  const lexicalRel = path.relative(cwd, outViews);
  if (lexicalRel === "" || lexicalRel.startsWith("..") || path.isAbsolute(lexicalRel)) {
    throw new Error(
      `refusing to build into ${JSON.stringify(outViews)} — outDir must resolve under cwd ${JSON.stringify(cwd)}`,
    );
  }
  const realCwd = fs.realpathSync(cwd);
  const realOutAncestor = fs.realpathSync(deepestExisting(outViews));
  const realRel = path.relative(realCwd, realOutAncestor);
  if (realRel !== "" && (realRel.startsWith("..") || path.isAbsolute(realRel))) {
    throw new Error(
      `refusing to build into ${JSON.stringify(outViews)} — resolved path ${JSON.stringify(realOutAncestor)} is outside cwd ${JSON.stringify(realCwd)} (symlink escape)`,
    );
  }
  // Wipe the mirror dir so deleted .tse sources don't leave orphan shims
  // behind. The docs (plan §2.8) state the mirror "is regenerated on
  // every build"; keeping orphans would let stale `views-manifest.ts`
  // entries silently typecheck against templates the user already removed.
  fs.rmSync(outViews, { recursive: true, force: true });
  fs.mkdirSync(outViews, { recursive: true });
  for (const rel of files) {
    const src = fs.readFileSync(path.join(viewsDir, rel), "utf8");
    const shim = virtualizeTse(src);
    const js = compileJs(src).code;
    const outBase = path.join(outViews, rel);
    fs.mkdirSync(path.dirname(outBase), { recursive: true });
    fs.writeFileSync(outBase + ".ts", shim);
    fs.writeFileSync(outBase + ".js", js);
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "views-manifest.ts"), emitManifest(files));
  return { count: files.length, files };
}

/** Walk up from `p` until we find an extant path. Always terminates at the
 * filesystem root, which is guaranteed to exist. Used by the realpath-based
 * safety check so we resolve symlinks on the deepest portion of the target
 * mirror dir that actually exists on disk. */
function deepestExisting(p: string): string {
  let cur = path.resolve(p);
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) return cur;
    cur = parent;
  }
  return cur;
}

function walkTse(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const entries = fs.readdirSync(dir, { recursive: true, withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".tse")) continue;
    // `parentPath` is the Node 20.12+ field; older builds expose the same
    // value under the deprecated `path`. Read both so we don't break on
    // engines that still ship the old shape.
    const parent =
      (e as fs.Dirent & { parentPath?: string }).parentPath ??
      (e as fs.Dirent & { path?: string }).path ??
      dir;
    const full = path.join(parent, e.name);
    out.push(path.relative(dir, full).split(path.sep).join("/"));
  }
  return out.sort();
}

/** Strip the trailing `.tse` handler. Keeps `<name>.<format>` (e.g. `users/show.html`). */
function manifestKey(rel: string): string {
  return rel.replace(/\.tse$/u, "");
}

function emitManifest(files: readonly string[]): string {
  const lines: string[] = [
    "// AUTO-GENERATED by `trails-tsc-views build` — do not edit.",
    "// Regenerate by running `trails-tsc-views build`.",
    "",
    "export const views = {",
  ];
  for (const rel of files) {
    const key = manifestKey(rel);
    const spec = "./views/" + rel + ".js";
    lines.push(`  ${JSON.stringify(key)}: () => import(${JSON.stringify(spec)}),`);
  }
  lines.push(
    "} as const;",
    "",
    "export type ViewKey = keyof typeof views;",
    "",
    "/** Mapped-type registry — value is the loaded template module's default export. */",
    'export type ViewsManifest = { [K in ViewKey]: Awaited<ReturnType<(typeof views)[K]>>["default"] };',
    "",
  );
  return lines.join("\n");
}
