/**
 * The framework constant table's path derivation (RFC 0213 § "Framework
 * constants"): a row's Ruby path read off the file tree, as
 * `cpath_expected_at` reads it, with each segment named by the loader's
 * `cname_for` over a `GemInflector`. Rails' framework gems are not Zeitwerk
 * managed, so what a layout cannot say is a row in `constant-residue.json`,
 * which `pnpm parity:class-paths` refreshes from `rails-api.json` and
 * `--check` holds to the tables. That residue is too large for a hand-kept
 * override list (RFC 0213, open question 3), so it keeps its manifest source.
 */
import * as path from "node:path";
import { GemInflector, Loader, NameError } from "@blazetrails/zeitwerk";
import { RUBY_FILE_TS_OVERRIDES, TOKEN_RENAMES, TS_CLASS_RENAMES } from "../parity/conventions.js";
import { ROOT_DIR } from "./config.js";

/** The `TS_CLASS_RENAMES` a Ruby path keeps: `Rails::Railtie` is `Rails::Trailtie`. */
export const BRAND_RENAMES = ["Railtie", "Railties"];

export interface GemLayout {
  /** The namespace `src/` stands for, or "" where its directories are the roots (`action_controller/`). */
  root: string;
  /** `src` directories that add no namespace, the `collapse` entries. */
  collapse?: string[];
  /** A second class in `foo.ts` is `Foo`'s sibling (`Arel::Nodes::Between`), not nested in it. */
  siblings?: boolean;
}

/** One row per gem. A package with no row has its directories for roots. */
export const GEM_LAYOUTS: Record<string, GemLayout> = {
  actioncable: { root: "ActionCable" },
  actionpack: { root: "", collapse: ["metal", "middleware", "testing", "http", "api"] },
  actionview: { root: "ActionView", collapse: ["renderer"] },
  activejob: { root: "ActiveJob" },
  activemodel: { root: "ActiveModel", siblings: true },
  activerecord: { root: "ActiveRecord", collapse: ["abstract", "relation"], siblings: true },
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

const RUBY_PACKAGE: Record<string, string> = { "did-you-mean": "did_you_mean" };

/** `tse-tracker` is `ruby_tracker`'s file, so its `cname` is `RubyTracker`. */
function fileOverrides(dir: string): Record<string, string> {
  const camel = (s: string) => s.replace(/(?:^|_)(\w)/g, (_, c: string) => c.toUpperCase());
  const prefix = `${RUBY_PACKAGE[dir] ?? dir}:`;
  const out: Record<string, string> = {};
  for (const [key, tsFile] of Object.entries(RUBY_FILE_TS_OVERRIDES)) {
    if (!key.startsWith(prefix)) continue;
    const tsBase = path.posix.basename(tsFile, ".ts").replace(/-/g, "_");
    out[tsBase] ??= camel(path.posix.basename(key.slice(prefix.length), ".rb"));
  }
  return out;
}

const loaders = new Map<string, Loader>();

function loaderFor(dir: string): Loader {
  let loader = loaders.get(dir);
  if (loader) return loader;
  loader = new Loader();
  const inflector = new GemInflector(path.join(ROOT_DIR, "packages", dir, "src", `${dir}.rb`));
  inflector.inflect(
    Object.fromEntries(Object.values(TOKEN_RENAMES).map((to) => [to, to.toUpperCase()])),
  );
  inflector.inflect(fileOverrides(dir));
  loader.inflector = inflector;
  loaders.set(dir, loader);
  return loader;
}

/** The Ruby `cname` of a TS class: `ModelName` is `Name`, and `Trailtie` stays. */
function rubyCname(tsName: string): string {
  const short = tsName.split(".").at(-1)!;
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
  const { root, collapse = [], siblings = false } = GEM_LAYOUTS[dir] ?? { root: "" };
  const loader = loaderFor(dir);
  const abspath = path.join(ROOT_DIR, "packages", dir, "src", file);
  const cname = (segment: string) => loader.cnameFor(segment.replace(/-/g, "_"), abspath);
  const dirs = path.posix.dirname(file).split("/");
  try {
    const cpath = root === "" ? [] : [root];
    for (const segment of dirs) {
      if (segment !== "." && !collapse.includes(segment)) cpath.push(await cname(segment));
    }
    const fileCname = await cname(path.posix.basename(file, ".ts"));
    const short = rubyCname(tsName);
    if (short !== fileCname && !siblings) cpath.push(fileCname);
    cpath.push(short);
    return cpath.join("::");
  } catch (error) {
    if (error instanceof NameError) return null;
    throw error;
  }
}
