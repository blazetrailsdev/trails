/**
 * Reads the README Quickstart's fenced blocks at build time, by the
 * `<!-- #region quickstart-* -->` names the Getting Started guide includes.
 * CI runs those blocks (`scripts/quickstart/run.sh`), so the landing page
 * shows only code and output a real run produced.
 */
import * as fs from "fs/promises";
import * as path from "path";
import { REPO_ROOT } from "./parity.js";

export interface QuickstartBlock {
  region: string;
  lang: string;
  code: string;
}

export async function quickstartBlocks(root = REPO_ROOT): Promise<QuickstartBlock[]> {
  const text = await fs.readFile(path.join(root, "README.md"), "utf8");
  const out: QuickstartBlock[] = [];
  const regions = text.matchAll(
    /<!-- #region (quickstart-[\w-]+) -->\n([\s\S]*?)<!-- #endregion \1 -->/g,
  );
  for (const [, region, body] of regions) {
    for (const [, lang, code] of body.matchAll(/^```(\w*)\n([\s\S]*?)^```$/gm)) {
      out.push({ region, lang, code: code.trimEnd() });
    }
  }
  return out;
}

/** The first block of `region` whose code starts with `prefix`. */
export function quickstartBlock(
  blocks: QuickstartBlock[],
  region: string,
  prefix: string,
): QuickstartBlock {
  const found = blocks.find((b) => b.region === region && b.code.startsWith(prefix));
  if (found === undefined) throw new Error(`README Quickstart has no ${region} block "${prefix}"`);
  return found;
}

/** The landing page's code blocks, each a Quickstart block named by region and leading text. */
export const LANDING_BLOCKS = [
  {
    region: "quickstart-query",
    prefix: "// app/models/post.ts",
    title: "Models are typed classes.",
    body: "The generator writes a model that declares no attributes. They come from the table, and `trails-tsc` types them from `db/schema.ts`.",
  },
  {
    region: "quickstart-scaffold",
    prefix: "// db/migrate/",
    title: "Migrations build the schema.",
    body: "A migration subclasses `Migration.get(8.0)`, Rails' `ActiveRecord::Migration[8.0]`, and `pnpm db:migrate` dumps `db/schema.ts` as Rails dumps `schema.rb`.",
  },
  {
    region: "quickstart-query",
    prefix: "             Prefix",
    title: "Routes map requests to controllers.",
    body: '`this.resources("posts")` draws the seven RESTful routes, and `bin/trails routes` prints them as Rails does.',
  },
  {
    region: "quickstart-page",
    prefix: "<!DOCTYPE html>",
    title: "Views render the scaffold.",
    body: "`GET /posts` renders Rails' scaffold templates, ported to TSE, inside the generated layout.",
  },
] as const;

/** The three getting-started cards: `trails new`, the scaffold's model and controller, and serving it. */
export const LANDING_STEPS = [
  { region: "quickstart-new", prefix: "cd ..", tag: "Step 1", title: "Generate an application" },
  {
    region: "quickstart-scaffold",
    prefix: "bin/trails generate scaffold",
    tag: "Step 2",
    title: "Scaffold a model and controller",
  },
  { region: "quickstart-server", prefix: "bin/trails server", tag: "Step 3", title: "Serve it" },
] as const;

/** The hero: the Quickstart's `trails-tsc` file and the error the build reports for it. */
export function landingHero(blocks: QuickstartBlock[]) {
  const file = quickstartBlock(blocks, "quickstart-typecheck", "// app/models/check.ts");
  const error = blocks.find((b) => b.region === "quickstart-typecheck" && b.lang === "text");
  const at = error && /^\/\/ (\S+)/.exec(file.code);
  const pos = at && new RegExp(`^${at[1]}\\((\\d+),(\\d+)\\)`).exec(error.code);
  if (!error || !pos) throw new Error("README Quickstart has no trails-tsc error for check.ts");
  return { file, error, line: Number(pos[1]) + 1, column: Number(pos[2]) };
}
