/**
 * The framework constant table's derivation (RFC 0213 § "Framework
 * constants"): each package's `src/` is walked with `Loader#ls`, and a class's
 * Ruby path is read off the tree by `Loader#cpath_expected_at`, whose segments
 * come from `cname_for` over an `Inflector`. A package's root namespace is its
 * `PACKAGE_LAYOUTS` row, and the loader is `Registry.loaderForPackage`'s.
 * Rails' framework gems are not Zeitwerk managed, so what a layout cannot say
 * is a row in `constant-residue.json`. That residue is too large for a
 * hand-kept override list (open question 3), so it keeps its `rails-api.json`
 * source.
 */
import ts from "typescript-5";
import { File, getFs } from "@blazetrails/ruby-compat";
import { Inflector, NameError, Registry, type Loader } from "@blazetrails/zeitwerk";
import {
  RUBY_FILE_TS_OVERRIDES,
  TOKEN_RENAMES,
  TS_CLASS_RENAMES,
  rubyFileToTs,
} from "../parity/conventions.js";
import { DIR_TO_PACKAGES, ROOT_DIR } from "./config.js";

/** The `TS_CLASS_RENAMES` a Ruby path keeps: `Rails::Railtie` is `Rails::Trailtie`. */
export const BRAND_RENAMES = ["Railtie", "Railties"];

export interface PackageLayout {
  /** The namespace `src/` stands for; absent where its directories are the roots. */
  root?: string;
  /** `src`-relative directories that add no namespace: the loader's `collapse` entries. */
  collapse?: string[];
  /** A second class in `foo.ts` is `Foo`'s sibling (`Arel::Nodes::Between`), not nested in it. */
  siblings?: boolean;
}

/** A package with no row has its directories for roots. */
export const PACKAGE_LAYOUTS: Record<string, PackageLayout> = {
  actioncable: { root: "ActionCable" },
  actionpack: {
    collapse: [
      "action-controller/metal",
      "action-controller/controller/metal",
      "action-controller/api",
      "action-controller/controller/api",
      "action-dispatch/middleware",
      "action-dispatch/testing",
      "action-dispatch/http",
    ],
  },
  actionview: { root: "ActionView", collapse: ["renderer"] },
  activejob: { root: "ActiveJob" },
  activemodel: { root: "ActiveModel", siblings: true },
  activerecord: {
    root: "ActiveRecord",
    collapse: ["connection-adapters/abstract", "relation"],
    siblings: true,
  },
  activestorage: { root: "ActiveStorage", siblings: true },
  activesupport: { root: "ActiveSupport", collapse: ["values"] },
  arel: { root: "Arel", siblings: true },
  "did-you-mean": { root: "DidYouMean", siblings: true },
  "et-orbi": { root: "EtOrbi" },
  bcrypt: { root: "BCrypt", siblings: true },
  builder: { root: "Builder", siblings: true },
  chronic: { root: "Chronic", collapse: ["repeaters"], siblings: true },
  fugit: { root: "Fugit" },
  globalid: { root: "GlobalID" },
  i18n: { root: "I18n", siblings: true },
  mail: { root: "Mail", collapse: ["fields", "elements"] },
  marcel: { root: "Marcel", siblings: true },
  "mini-magick": { root: "MiniMagick", siblings: true },
  msgpack: { root: "MessagePack" },
  "net-smtp": { root: "Net::SMTP" },
  rack: { root: "Rack" },
  "rack-session": { root: "Rack::Session", siblings: true },
  "rack-test": { root: "Rack::Test", siblings: true },
  rackup: { root: "Rackup", siblings: true },
  rake: { root: "Rake", siblings: true },
  "solid-cable": { root: "SolidCable", siblings: true },
  "solid-queue": { root: "SolidQueue" },
  thor: { root: "Thor", collapse: ["parser"], siblings: true },
  trailties: { root: "Rails", collapse: ["commands"] },
  zeitwerk: { root: "Zeitwerk", siblings: true },
};

function srcRoot(dir: string): string {
  return File.join(ROOT_DIR, "packages", dir, "src");
}

function fileInflections(dir: string): Record<string, string> {
  const plain = new Inflector();
  const rows = (DIR_TO_PACKAGES[dir] ?? [dir]).flatMap((pkg) =>
    Object.entries(RUBY_FILE_TS_OVERRIDES)
      .filter(([key]) => key.startsWith(`${pkg}:`))
      .map(([key, tsFile]) => [key.slice(pkg.length + 1), tsFile]),
  );
  const out: Record<string, string> = {};
  for (const [rubyFile, tsFile] of rows) {
    const folded = rows.filter(([, other]) => other === tsFile).length > 1;
    const unmoved = File.dirname(rubyFileToTs(rubyFile, undefined, false)) === File.dirname(tsFile);
    if (folded || !unmoved) continue;
    const basename = File.basename(tsFile, ".ts").replaceAll("-", "_");
    out[basename] = plain.camelize(File.basename(rubyFile, ".rb"), null);
  }
  return out;
}

const loaders = new Map<string, Promise<Loader>>();

function rootNamespace(root: string | undefined): object {
  if (root === undefined) return Object;
  const namespace = class {};
  Object.defineProperty(namespace, "name", { value: root });
  return namespace;
}

async function buildLoader(dir: string): Promise<Loader> {
  const { root, collapse = [] } = PACKAGE_LAYOUTS[dir] ?? {};
  const packageFile = File.join(ROOT_DIR, "packages", dir, "package.json");
  const loader = await Registry.loaderForPackage(packageFile, {
    namespace: rootNamespace(root),
  });
  const inflector = new Inflector();
  inflector.inflect({
    gem_version: "VERSION",
    ...Object.fromEntries(
      Object.values(TOKEN_RENAMES)
        .filter((to) => to.toLowerCase() !== "trails")
        .map((to) => [to, to.toUpperCase()]),
    ),
    ...fileInflections(dir),
  });
  loader.inflector = inflector;
  if (collapse.length > 0) {
    await loader.collapse(...collapse.map((d) => File.join(srcRoot(dir), d)));
  }
  return loader;
}

function loaderFor(dir: string): Promise<Loader> {
  let loader = loaders.get(dir);
  if (loader === undefined) loaders.set(dir, (loader = buildLoader(dir)));
  return loader;
}

function rubyCname(short: string): string {
  const renamed = Object.entries(TS_CLASS_RENAMES).filter(
    ([ruby, ts]) => ts === short && !BRAND_RENAMES.includes(ruby),
  );
  if (renamed.length > 1) {
    throw new globalThis.Error(`TS_CLASS_RENAMES maps several Ruby names to ${short}`);
  }
  return renamed[0]?.[0] ?? short;
}

/**
 * The path `dir`'s layout gives the class `tsName` in `file`, relative to
 * `src/`, or null where `cname_for` refuses a segment (`encodings/7bit.ts`).
 * A dotted `tsName` keeps its owner.
 */
export async function derivedConstantPath(
  dir: string,
  file: string,
  tsName: string,
): Promise<string | null> {
  const loader = await loaderFor(dir);
  let cpath: string | null;
  try {
    cpath = await loader.cpathExpectedAt(File.join(srcRoot(dir), file));
  } catch (error) {
    if (error instanceof NameError) return null;
    throw error;
  }
  if (cpath === null) return null;
  const segments = cpath.split("::");
  const [first, ...nested] = tsName.split(".").map(rubyCname);
  if (first !== segments.at(-1)) {
    if (PACKAGE_LAYOUTS[dir]?.siblings) segments.pop();
    segments.push(first);
  }
  return [...segments, ...nested].join("::");
}

/** Walks `dir`'s `src/` as the loader does, and answers each exported class's derived row. */
export async function walkConstants(dir: string): Promise<Map<string, string>> {
  const loader = await loaderFor(dir);
  const src = srcRoot(dir);
  const rows = new Map<string, string>();
  const walk = async (subdir: string): Promise<void> => {
    await loader.ls(subdir, async (_basename, abspath, ftype) => {
      if (ftype === "directory") return walk(abspath);
      const source = await getFs().readFile(abspath, "utf8");
      const file = abspath.slice(src.length + 1);
      const parsed = ts.createSourceFile(abspath, source, ts.ScriptTarget.Latest);
      for (const statement of parsed.statements) {
        if (!ts.isClassDeclaration(statement) || statement.name === undefined) continue;
        const exported = ts
          .getModifiers(statement)
          ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        const ambient = ts
          .getModifiers(statement)
          ?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword);
        if (!exported || ambient) continue;
        const tsName = statement.name.text;
        const fqn = await derivedConstantPath(dir, file, tsName);
        if (fqn !== null) rows.set(`${file}::${tsName}`, fqn);
      }
    });
  };
  await walk(src);
  return rows;
}
