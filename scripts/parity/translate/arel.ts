/**
 * Arel query translator: Ruby → TypeScript skeleton generator
 *
 * Usage (from repo root):
 *   tsx scripts/parity/translate/arel.ts [--fixture arel-XX] [--dry-run] [--force]
 *
 * Reads the `-- Query:` comment from each arel fixture's schema.sql,
 * applies the rule-based translation map from docs/query-parity-verification.md,
 * and writes query.rb + query.ts skeletons into the fixture directory.
 *
 * Run when adding new fixtures. Existing files are skipped unless --force.
 * Generated files are starting points — review and correct before committing.
 *
 * Must be run from the repo root.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const FIXTURES_DIR = "scripts/parity/fixtures";

interface FixtureInfo {
  name: string;
  query: string;
  tables: string[];
}

function usage(): never {
  process.stderr.write(
    "Usage: tsx scripts/parity/translate/arel.ts [--fixture arel-XX] [--dry-run] [--force]\n",
  );
  process.exit(1);
}

function parseArgs(): { fixture?: string; dryRun: boolean; force: boolean } {
  const args = process.argv.slice(2);
  let fixture: string | undefined;
  let dryRun = false;
  let force = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--fixture") {
      const val = args[++i];
      if (!val || val.startsWith("-")) {
        process.stderr.write("--fixture requires a fixture name (e.g. --fixture arel-06)\n");
        usage();
      }
      if (!/^arel-\d{2}$/.test(val!)) {
        process.stderr.write(`--fixture value must match arel-NN (e.g. arel-06), got: ${val}\n`);
        usage();
      }
      fixture = val;
    } else if (args[i] === "--dry-run") dryRun = true;
    else if (args[i] === "--force") force = true;
    else {
      process.stderr.write(`unknown argument: ${args[i]}\n`);
      usage();
    }
  }
  return { fixture, dryRun, force };
}

function parseSchemaSql(dir: string): FixtureInfo {
  const sql = readFileSync(join(dir, "schema.sql"), "utf8");
  const fixtureMatch = sql.match(/-- Fixture for statement: (\S+)/);
  const queryMatch = sql.match(/-- Query: (.+)/);
  const tables = [...sql.matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1]!.toLowerCase());

  if (!fixtureMatch) {
    process.stderr.write(
      `parity translate: ${dir}/schema.sql missing '-- Fixture for statement:' line\n`,
    );
    process.exit(1);
  }
  if (!queryMatch) {
    process.stderr.write(`parity translate: ${dir}/schema.sql missing '-- Query:' line\n`);
    process.exit(1);
  }

  // Strip trailing Ruby inline comments (# ...) so they don't land in generated files.
  const query = queryMatch[1]!.replace(/\s*#.*$/, "").trim();

  return { name: fixtureMatch[1]!, query, tables };
}

/**
 * Apply the Ruby→TypeScript translation rules from docs/query-parity-verification.md.
 * Returns [rbExpr, tsExpr] for the body of the query expression.
 * When the query is too complex for rule-based translation, returns a TODO comment.
 */
// Patterns in `-- Query:` annotations that can't be reliably auto-translated.
// Queries matching these get a TODO body rather than broken generated code.
const NON_TRANSLATABLE = [
  /\.\.\./, // truncated annotations: "posts.join(comments, OuterJoin)..."
  /^[A-Z].*\s+/, // prose descriptions: "Simple CTE: ...", "WITH users_top AS ..."
  /COUNT\(/, // raw SQL fragments
  /WITH\s/, // WITH clause prose
  /ORDER BY/, // raw SQL ORDER BY prose
  /~/, // bitwise NOT — operand boundary can't be determined safely with regex
  /;/, // multi-statement forms: "replies = comments.alias; comments.join(...)"
  /\bquoted\(/, // unresolved helper: quoted('%Y%m') not a standard Arel method
  /:\w+\s*,/, // symbol args that aren't table/col refs: project(:id, :title)
  /\/\./, // slash-separated variant lists: users[:age].sum/.average/.minimum
  /\.arel_table\b/, // Rails model.arel_table requires pluralisation/snake_case knowledge
];

function isNonTranslatable(query: string): boolean {
  return NON_TRANSLATABLE.some((re) => re.test(query));
}

function translateQuery(
  query: string,
  tables: string[],
): { rb: string; ts: string; imports: string[] } {
  // Build table declaration lines
  const rbDecls = tables.map((t) => `${t} = Arel::Table.new(:${t})`).join("\n");
  const tsDecls = tables.map((t) => `const ${t} = new Table("${t}");`).join("\n");

  if (isNonTranslatable(query)) {
    // Keep the same module shape as translatable queries (default export) so the
    // Node runner fails with a clear message rather than "default export is
    // undefined". The thrown-error default makes the TODO explicit at evaluation.
    const todo = `// TODO: translate — ${query}`;
    const throwExpr = `((() => { throw new Error("parity fixture not translated: ${query.replace(/["\\]/g, "\\$&")}"); })())`;
    return {
      rb: `${rbDecls}\n# TODO: translate — ${query}`,
      ts: `${tsDecls}\n${todo}\nexport default ${throwExpr};`,
      imports: ["Table"],
    };
  }

  // Apply single-expression translations (all rules verified against packages/arel/src/).
  // IMPORTANT: %w[...] rewrite must run before not_in_any wrapping so the wrapping
  // rule sees the expanded array literal, not the %w form.
  let tsExpr = query
    // %w[...] → array literal (runs first so downstream rules see JS array syntax)
    .replace(
      /%w\[([^\]]+)\]/g,
      (_, words) =>
        "[" +
        words
          .trim()
          .split(/\s+/)
          .map((w: string) => `"${w}"`)
          .join(", ") +
        "]",
    )
    // tbl[:col] → tbl.get("col")
    .replace(/(\w+)\[:([\w_]+)\]/g, '$1.get("$2")')
    // tbl[Arel.star] → tbl.star
    .replace(/(\w+)\[Arel\.star\]/g, "$1.star")
    // Arel.star → star (standalone)
    .replace(/\bArel\.star\b/g, "star")
    // Arel.sql(...) → sql(...)
    .replace(/Arel\.sql\(/g, "sql(")
    // .not_eq → .notEq
    .replace(/\.not_eq\(/g, ".notEq(")
    // .not_in → .notIn
    .replace(/\.not_in\(/g, ".notIn(")
    // .not_in_any → .notInAny with arg wrapping.
    // Rails: col.not_in_any(["A","B"]) = NOT IN ('A') OR NOT IN ('B')
    // Trails: col.notInAny([["A"], ["B"]]) — each inner array is one notIn call
    .replace(
      /\.not_in_any\(\[([^\]]+)\]\)/g,
      (_, inner) =>
        ".notInAny([" +
        inner
          .split(",")
          .map((v: string) => `[${v.trim()}]`)
          .join(", ") +
        "])",
    )
    // Fallback for other not_in_any forms (just rename; review generated output)
    .replace(/\.not_in_any\(/g, ".notInAny(")
    // .is_distinct_from → .isDistinctFrom
    .replace(/\.is_distinct_from\(/g, ".isDistinctFrom(")
    // .does_not_match_regexp → .doesNotMatchRegexp
    .replace(/\.does_not_match_regexp\(/g, ".doesNotMatchRegexp(")
    // Ruby nil → JS null
    .replace(/\bnil\b/g, "null")
    // NOTE: Ruby string quotes ('…' → "…") are intentionally NOT rewritten here.
    // The replacement is too fragile (breaks on escaped apostrophes, nested quotes).
    // Generated files keep Ruby single quotes as-is; reviewers fix them manually.
    // Arel::Table.new(:foo) → new Table("foo")
    .replace(/Arel::Table\.new\(:(\w+)\)/g, 'new Table("$1")')
    // Qualified and bare Arel Node constructors → Nodes.* equivalents
    .replace(/(?:Arel::Nodes::)?NamedFunction\.new\(/g, "new Nodes.NamedFunction(")
    .replace(/(?:Arel::Nodes::)?Quoted\.new\(/g, "new Nodes.Quoted(")
    // Arel::Nodes::OuterJoin → Nodes.OuterJoin
    .replace(/Arel::Nodes::OuterJoin/g, "Nodes.OuterJoin")
    // Bare OuterJoin → Nodes.OuterJoin (negative lookbehind prevents double-translation)
    .replace(/(?<!Nodes\.)OuterJoin\b/g, "Nodes.OuterJoin")
    // Arel::Nodes::Window.new → new Nodes.Window()
    .replace(/Arel::Nodes::Window\.new/g, "new Nodes.Window()")
    // Arel::Nodes::As.new → new Nodes.As
    .replace(/Arel::Nodes::As\.new\(/g, "new Nodes.As(")
    // Property aggregates → method calls (table.ts / attribute.ts)
    .replace(/\.count\b(?!\()/g, ".count()")
    .replace(/\.sum\b(?!\()/g, ".sum()")
    .replace(/\.average\b(?!\()/g, ".average()")
    .replace(/\.maximum\b(?!\()/g, ".maximum()")
    .replace(/\.minimum\b(?!\()/g, ".minimum()")
    .replace(/\.distinct\b(?!\()/g, ".distinct()")
    .replace(/\.not\b(?!\()/g, ".not()")
    .replace(/\.desc\b(?!\()/g, ".desc()")
    .replace(/\.asc\b(?!\()/g, ".asc()");
  // (~ is caught by NON_TRANSLATABLE above; no rule needed here)
  // NOTE: Ruby infix arithmetic (+, -, *, /) cannot be reliably rewritten
  // to method chains (.add/.subtract/.multiply/.divide) with regex; those
  // fixtures are hand-translated in query.ts directly.

  // Determine needed imports.
  // Note: `~` (BitwiseNot) is caught by NON_TRANSLATABLE so it never reaches here;
  // fixtures using BitwiseNot are hand-translated (e.g. arel-30/query.ts).
  const imports: string[] = ["Table"];
  if (tsExpr.includes("Nodes.")) imports.push("Nodes");
  if (tsExpr.includes("sql(")) imports.push("sql");
  if (/\bstar\b/.test(tsExpr) && !tsExpr.includes(".star")) imports.push("star");

  return {
    rb: `${rbDecls}\n${query}`,
    ts: `${tsDecls}\nexport default ${tsExpr};`,
    imports: [...new Set(imports)].sort(),
  };
}

function generateRuby(info: FixtureInfo): string {
  const { rb } = translateQuery(info.query, info.tables);
  return `# ${info.name}: ${info.query}\n${rb}\n`;
}

function generateTs(info: FixtureInfo): string {
  const { ts, imports } = translateQuery(info.query, info.tables);
  const importLine = `import { ${imports.join(", ")} } from "@blazetrails/arel";`;
  return `// ${info.name}: ${info.query}\n${importLine}\n${ts}\n`;
}

function arelFixtures(): string[] {
  return readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("arel-"))
    .map((e) => e.name)
    .sort();
}

function main(): void {
  if (!existsSync(FIXTURES_DIR)) {
    process.stderr.write("parity translate: must be run from repo root\n");
    process.exit(1);
  }

  const { fixture, dryRun, force } = parseArgs();
  const fixtures = fixture ? [fixture] : arelFixtures();

  let generated = 0;
  let skipped = 0;

  for (const name of fixtures) {
    const dir = join(FIXTURES_DIR, name);
    if (!existsSync(join(dir, "schema.sql"))) {
      if (fixture) {
        // Explicit --fixture target: fail fast so typos don't look like success.
        process.stderr.write(`parity translate: fixture not found: ${dir}/schema.sql\n`);
        process.exit(1);
      }
      process.stderr.write(`  skip ${name}: no schema.sql\n`);
      continue;
    }

    const rbPath = join(dir, "query.rb");
    const tsPath = join(dir, "query.ts");

    // Skip if either file exists (not just both) — avoids clobbering hand edits.
    const rbExists = existsSync(rbPath);
    const tsExists = existsSync(tsPath);
    if (!force && (rbExists || tsExists)) {
      skipped++;
      continue;
    }

    const info = parseSchemaSql(dir);
    const rb = generateRuby(info);
    const ts = generateTs(info);

    if (dryRun) {
      process.stdout.write(`\n=== ${name}/query.rb ===\n${rb}`);
      process.stdout.write(`\n=== ${name}/query.ts ===\n${ts}`);
    } else {
      writeFileSync(rbPath, rb);
      writeFileSync(tsPath, ts);
      generated++;
    }
  }

  if (!dryRun) {
    process.stdout.write(`generated: ${generated}, skipped (already exist): ${skipped}\n`);
    if (generated > 0) {
      process.stdout.write(
        "Review all generated files — rule-based translation is approximate for complex queries.\n",
      );
    }
  }
}

main();
