import { Digest, Dir, File, getFs, getPath, rbObjClassname } from "@blazetrails/ruby-compat";
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
  shadowed: string[];
}

/** @noRailsEquivalent PERMANENT */
export function manifestRoot(loader: Loader): string {
  return loader.manifestRoot ?? Dir.pwd();
}

/** @noRailsEquivalent PERMANENT */
export function configurationDigest(loader: Loader): string {
  const root = manifestRoot(loader);
  const relative = (abspath: string) => getPath().relative!(root, abspath);
  const overrides = (
    loader.inflector as unknown as { overrides?(): Record<string, string> }
  ).overrides?.();
  return Digest.SHA256.hexdigest(
    JSON.stringify({
      roots: Object.entries(loader.roots).map(([dir, namespace]) => [
        relative(dir),
        loader.realModName(namespace),
      ]),
      ignore: [...loader.ignoredGlobPatterns].map(relative).sort(),
      collapse: [...loader.collapseGlobPatterns].map(relative).sort(),
      inflector: rbObjClassname(loader.inflector),
      inflections: Object.entries(overrides ?? {}).sort(),
    }),
  );
}

/** @noRailsEquivalent PERMANENT */
export async function buildManifest(loader: Loader): Promise<Manifest> {
  const root = manifestRoot(loader);
  const relative = (abspath: string) => getPath().relative!(root, abspath);
  const constants: Record<string, ManifestRow> = {};
  const seen = new Set<string>();

  try {
    const { manifest } = loader;
    loader.manifest = null;
    await loader.recomputeIgnoredPaths();
    await loader.recomputeCollapseDirs();
    loader.manifest = manifest;

    const roots = await loader.actualRoots();
    for (const [rootDir, rootNamespace] of Object.entries(roots)) {
      await loader["defineAutoloadsForDir"](rootDir, rootNamespace);
    }

    for (;;) {
      const pending = Object.entries(loader.autoloads).filter(([abspath]) => !seen.has(abspath));
      if (pending.length === 0) break;

      for (const [abspath, cref] of pending) {
        seen.add(abspath);
        const dirs = loader.namespaceDirs.delete(cref);
        const file = await loader.isRuby(abspath);
        constants[cref.path()] = {
          path: relative(abspath),
          export: file ? cref.cname : null,
          kind: !file
            ? "implicit"
            : ExplicitNamespaces.isRegistered(cref) === loader
              ? "explicit"
              : "file",
          ...(dirs != null ? { dirs: dirs.map(relative) } : {}),
        };
        if (dirs != null) {
          const namespace = cref.set({});
          for (const dir of dirs) await loader["defineAutoloadsForDir"](dir, namespace);
        }
      }
    }

    return {
      digest: configurationDigest(loader),
      constants,
      shadowed: [...loader.shadowedFiles].map(relative),
    };
  } finally {
    for (const cref of Object.values(loader.autoloads)) cref.remove();
    loader.autoloads = {};
    loader.namespaceDirs.clear();
    loader.shadowedFiles.clear();
    Registry.onUnload(loader);
    ExplicitNamespaces.unregisterLoader(loader);
  }
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
  const root = manifestRoot(loader);
  const dir = File.join(File.expandPath(outDir, root), loader.tag);
  const fs = getFs();

  const imports: string[] = [];
  const types: string[] = [];
  for (const [cpath, row] of Object.entries(manifest.constants)) {
    if (row.export == null) {
      types.push(`    ${JSON.stringify(cpath)}: object;`);
      continue;
    }
    const specifier = _specifier(dir, File.expandPath(row.path, root));
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
