import { existsSync } from "node:fs";
import type { Plugin } from "vite";

const LIB = /^(.*\/packages\/[^/]+)\/lib\/(.+?)(?<!\.d)\.ts$/;

/**
 * Maps a workspace package's `lib/*.ts` path to its built `dist/*.js`, and
 * answers any other path unchanged. A `lib` file with no built counterpart
 * raises: loading it from source beside the rest from `dist` would give the
 * child two copies of a framework module.
 *
 * @noRailsEquivalent PERMANENT
 */
export function isolationDistPath(file: string): string {
  const match = LIB.exec(file);
  if (!match) return file;
  const dist = `${match[1]}/dist/${match[2]}.js`;
  if (!existsSync(dist)) throw new Error(`ISOLATION_DIST=1 but ${dist} is not built`);
  return dist;
}

/**
 * Resolves every workspace `lib/*.ts` import to `dist/*.js` in an
 * `Isolation::Subprocess` child (`ISOLATION_TEST` set), so the child loads the
 * framework as native modules instead of re-transforming it from source on
 * every isolated test. Engaged by `ISOLATION_DIST=1`, which CI sets after
 * `pnpm build`, so a local run never reads a stale `dist`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function isolationDistResolver(): Plugin {
  return {
    name: "isolation-dist-resolver",
    enforce: "pre",
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || resolved.external) return resolved;
      const id = isolationDistPath(resolved.id);
      return id === resolved.id ? resolved : { id, external: true };
    },
  };
}
