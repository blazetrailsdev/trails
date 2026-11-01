import { Digest, Dir, File, getFs, getPath } from "@blazetrails/ruby-compat";
import type { Loader } from "../loader.js";
import { ExplicitNamespaces } from "../registry/explicit-namespaces.js";
import { Registry } from "../registry.js";

/** @noRailsEquivalent PERMANENT */
export interface ManifestRow {
  path: string;
  export: string | null;
  kind: "file" | "implicit" | "explicit";
  dirs?: string[];
}

/** @noRailsEquivalent PERMANENT */
export interface Manifest {
  digest: string;
  constants: Record<string, ManifestRow>;
}

function _relative(abspath: string): string {
  return getPath().relative!(Dir.pwd(), abspath);
}

/** @noRailsEquivalent PERMANENT */
export function configurationDigest(loader: Loader): string {
  const overrides = (loader.inflector as unknown as { _overrides?: Record<string, string> })
    ._overrides;
  return Digest.SHA256.hexdigest(
    JSON.stringify({
      tag: loader.tag,
      roots: Object.entries(loader.roots).map(([dir, namespace]) => [
        _relative(dir),
        loader.realModName(namespace),
      ]),
      ignore: [...loader.ignoredGlobPatterns].map(_relative).sort(),
      collapse: [...loader.collapseGlobPatterns].map(_relative).sort(),
      inflector: loader.inflector.constructor.name,
      inflections: Object.entries(overrides ?? {}).sort(),
    }),
  );
}

/** @noRailsEquivalent PERMANENT */
export async function buildManifest(loader: Loader): Promise<Manifest> {
  await loader.setup();

  const constants: Record<string, ManifestRow> = {};
  const seen = new Set<string>();

  for (;;) {
    const pending = Object.entries(loader.autoloads).filter(([abspath]) => !seen.has(abspath));
    if (pending.length === 0) break;

    for (const [abspath, cref] of pending) {
      seen.add(abspath);
      const dirs = loader.namespaceDirs.delete(cref);
      const file = await loader.isRuby(abspath);
      constants[cref.path()] = {
        path: _relative(abspath),
        export: file ? cref.cname : null,
        kind: !file
          ? "implicit"
          : ExplicitNamespaces.isRegistered(cref) === loader
            ? "explicit"
            : "file",
        ...(dirs != null ? { dirs: dirs.map(_relative) } : {}),
      };
      if (dirs != null) {
        const namespace = cref.set({});
        for (const dir of dirs) await loader["defineAutoloadsForDir"](dir, namespace);
      }
    }
  }

  for (const cref of Object.values(loader.autoloads)) cref.remove();
  loader.autoloads = {};
  Registry.onUnload(loader);
  ExplicitNamespaces.unregisterLoader(loader);
  loader._setup = false;

  return { digest: configurationDigest(loader), constants };
}

function _specifier(from: string, abspath: string): string {
  const specifier = getPath().relative!(from, abspath);
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
}

/** @noRailsEquivalent PERMANENT */
export async function writeArtifacts(
  loader: Loader,
  outDir: string = ".trails/autoload",
): Promise<string> {
  const manifest = await buildManifest(loader);
  const dir = File.join(File.expandPath(outDir), loader.tag);
  const fs = getFs();

  const imports: string[] = [];
  const types: string[] = [];
  for (const [cpath, row] of Object.entries(manifest.constants)) {
    if (row.export == null) {
      types.push(`    ${JSON.stringify(cpath)}: object;`);
      continue;
    }
    const specifier = _specifier(dir, File.expandPath(row.path));
    imports.push(`  ${JSON.stringify(cpath)}: () => import(${JSON.stringify(specifier)}),`);
    const typed = JSON.stringify(specifier.replace(/\.ts$/, ".js"));
    types.push(`    ${JSON.stringify(cpath)}: typeof import(${typed}).${row.export};`);
  }

  await fs.mkdir!(dir, { recursive: true });
  await fs.writeFile!(File.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile!(
    File.join(dir, "imports.generated.js"),
    `export const imports = {\n${imports.join("\n")}\n};\n`,
  );
  await fs.writeFile!(
    File.join(dir, "constants.generated.d.ts"),
    `declare module "@blazetrails/ruby-compat" {\n  interface ConstantTable {\n${types.join("\n")}\n  }\n}\n\nexport {};\n`,
  );
  return dir;
}
