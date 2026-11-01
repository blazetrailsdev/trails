/**
 * The framework constant table's path derivation (RFC 0213 § "Framework
 * constants"): a row's Ruby path read off the file tree, as
 * `cpath_expected_at` reads it, with each segment named by the loader's
 * `cname_for` over a `GemInflector`. Rails' framework gems are not Zeitwerk
 * managed, so what a layout cannot say is a row in `constant-residue.json`,
 * which `pnpm parity:class-paths` refreshes from `rails-api.json` and
 * `--check` holds to the tables. That residue is too large for a hand-kept
 * override list (RFC 0213, open question 3), so it keeps its manifest source.
 * The file is a reviewed record, not a ratchet: a new miss reds `--check` until
 * the regenerated file is committed.
 */
import * as path from "node:path";
import { GemInflector, Inflector, Loader, NameError } from "@blazetrails/zeitwerk";
import {
  RUBY_FILE_TS_OVERRIDES,
  TOKEN_RENAMES,
  TS_CLASS_RENAMES,
  rubyFileToTs,
} from "../parity/conventions.js";
import { DIR_TO_PACKAGES, ROOT_DIR } from "./config.js";

/** The `TS_CLASS_RENAMES` a Ruby path keeps: `Rails::Railtie` is `Rails::Trailtie`. */
export const BRAND_RENAMES = ["Railtie", "Railties"];

export interface GemLayout {
  /** The namespace `src/` stands for, or "" where its directories are the roots (`action_controller/`). */
  root: string;
  /** The directory under `src/` holding `version.rb`'s stand-in, where it is not `src/` itself. */
  gem?: string;
  /** `src`-relative directories that add no namespace, the `collapse` entries. */
  collapse?: string[];
  /** A second class in `foo.ts` is `Foo`'s sibling (`Arel::Nodes::Between`), not nested in it. */
  siblings?: boolean;
}

/** One row per gem. A package with no row has its directories for roots. */
export const GEM_LAYOUTS: Record<string, GemLayout> = {
  actioncable: { root: "ActionCable" },
  actionpack: {
    root: "",
    gem: "action-pack",
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
  bcrypt: { root: "BCrypt", siblings: true },
  builder: { root: "Builder", siblings: true },
  chronic: { root: "Chronic", collapse: ["repeaters"], siblings: true },
  "did-you-mean": { root: "DidYouMean", collapse: ["spell-checkers"], siblings: true },
  "et-orbi": { root: "EtOrbi", siblings: true },
  fugit: { root: "Fugit" },
  globalid: { root: "GlobalID" },
  i18n: { root: "I18n", siblings: true },
  mail: { root: "Mail", collapse: ["fields", "elements"] },
  marcel: { root: "Marcel", siblings: true },
  "mini-magick": { root: "MiniMagick", siblings: true },
  msgpack: { root: "MessagePack" },
  "net-smtp": { root: "Net::SMTP", siblings: true },
  rack: { root: "Rack" },
  "rack-session": { root: "Rack::Session" },
  "rack-test": { root: "Rack::Test", siblings: true },
  rake: { root: "Rake", siblings: true },
  "solid-cable": { root: "SolidCable", siblings: true },
  "solid-queue": { root: "SolidQueue" },
  thor: { root: "Thor", collapse: ["parser"], siblings: true },
  trailties: { root: "Rails", collapse: ["commands"] },
  zeitwerk: { root: "Zeitwerk", siblings: true },
};

/** A `GemInflector` that also answers a file `RUBY_FILE_TS_OVERRIDES` renamed, by its path. */
class FileCnameInflector extends GemInflector {
  constructor(
    rootFile: string,
    private fileCnames: Map<string, string>,
  ) {
    super(rootFile);
  }

  override camelize(basename: string, abspath: string | null): string {
    return this.fileCnames.get(abspath ?? "") ?? super.camelize(basename, abspath);
  }
}

/**
 * `tse-tracker.ts` is `ruby_tracker.rb` renamed, so its `cname` is
 * `RubyTracker`. A fold of several Ruby files onto one TS file, or a move to
 * another directory, says where methods are measured and names no file.
 */
function fileCnames(dir: string): Map<string, string> {
  const inflector = new Inflector();
  const rows = (DIR_TO_PACKAGES[dir] ?? [dir]).flatMap((pkg) =>
    Object.entries(RUBY_FILE_TS_OVERRIDES)
      .filter(([key]) => key.startsWith(`${pkg}:`))
      .map(([key, tsFile]) => [key.slice(pkg.length + 1), tsFile]),
  );
  const out = new Map<string, string>();
  for (const [rubyFile, tsFile] of rows) {
    const folded = rows.filter(([, other]) => other === tsFile).length > 1;
    if (
      folded ||
      path.posix.dirname(rubyFileToTs(rubyFile, undefined, false)) !== path.posix.dirname(tsFile)
    )
      continue;
    const cname = inflector.camelize(path.posix.basename(rubyFile, ".rb"), null);
    out.set(path.join(srcRoot(dir), tsFile.replace(/\.ts$/, ".rb")), cname);
  }
  return out;
}

function srcRoot(dir: string): string {
  return path.join(ROOT_DIR, "packages", dir, "src");
}

const loaders = new Map<string, Loader>();

function loaderFor(dir: string): Loader {
  let loader = loaders.get(dir);
  if (loader) return loader;
  loader = new Loader();
  const gem = GEM_LAYOUTS[dir]?.gem ?? dir;
  const inflector = new FileCnameInflector(path.join(srcRoot(dir), `${gem}.rb`), fileCnames(dir));
  inflector.inflect(
    Object.fromEntries(Object.values(TOKEN_RENAMES).map((to) => [to, to.toUpperCase()])),
  );
  loader.inflector = inflector;
  loaders.set(dir, loader);
  return loader;
}

/** The Ruby `cname` of a TS class: `ModelName` is `Name`, and `Trailtie` stays. */
function rubyCname(short: string): string {
  const renamed = Object.entries(TS_CLASS_RENAMES).find(
    ([ruby, ts]) => ts === short && !BRAND_RENAMES.includes(ruby),
  );
  return renamed?.[0] ?? short;
}

/**
 * The path `dir`'s layout gives the class `tsName` in `file`, relative to
 * `src/`, or null where `cname_for` refuses a segment (`encodings/7bit.ts`).
 */
export async function derivedConstantPath(
  dir: string,
  file: string,
  tsName: string,
): Promise<string | null> {
  const { root, gem, collapse = [], siblings = false } = GEM_LAYOUTS[dir] ?? { root: "" };
  const loader = loaderFor(dir);
  const src = srcRoot(dir);
  const cname = (segment: string, abspath: string) =>
    loader.cnameFor(segment.replace(/-/g, "_"), abspath);
  const cpath = root === "" ? [] : [root];
  try {
    const dirs = path.posix.dirname(file);
    let walked = "";
    for (const segment of dirs === "." ? [] : dirs.split("/")) {
      walked = path.posix.join(walked, segment);
      if (!collapse.includes(walked)) cpath.push(await cname(segment, path.join(src, walked)));
    }
    const versionFile = file === path.posix.join(gem ?? "", "gem-version.ts");
    const fileCname = await cname(
      path.posix.basename(file, ".ts"),
      versionFile
        ? path.join(src, gem ?? dir, "version.rb")
        : path.join(src, file.replace(/\.ts$/, ".rb")),
    );
    const [first, ...nested] = tsName.split(".").map(rubyCname);
    if (first !== fileCname && !siblings) cpath.push(fileCname);
    cpath.push(first, ...nested);
    return cpath.join("::");
  } catch (error) {
    if (error instanceof NameError) return null;
    throw error;
  }
}
