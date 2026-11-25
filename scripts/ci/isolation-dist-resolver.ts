import { existsSync } from "node:fs";
import type { Plugin } from "vite";

const LIB = /^(.*\/packages\/[^/]+)\/lib\/(.+)\.ts$/;

/**
 * Resolves a workspace package's `lib/*.ts` to its built `dist/*.js` in an
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
      const match = resolved && !resolved.external ? LIB.exec(resolved.id) : null;
      if (!match) return resolved;
      const dist = `${match[1]}/dist/${match[2]}.js`;
      return existsSync(dist) ? { id: dist, external: true } : resolved;
    },
  };
}
