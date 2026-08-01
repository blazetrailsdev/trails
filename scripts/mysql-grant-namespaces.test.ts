import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `scripts/db-init/mysql/01-rails-user.sql` grants the `rails` test user a set
 * of database-name patterns rather than `*.*`, which couples that file to every
 * database name the suites invent. The coupling broke during the review of the
 * PR that introduced it (#5646): the activerecord-cli E2E suites create
 * `ar_cli_e2e_<hrtime>` through `ar db:create` as the same user, no grant
 * covered it, and the failure surfaced only on the MySQL legs, only in CI, as
 * an exit code — a grep for `CREATE DATABASE` found nothing, because the
 * database is created through the CLI. This suite derives the granted
 * namespaces from that SQL and checks the known database-name producers against
 * them.
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GRANT_FILE = "scripts/db-init/mysql/01-rails-user.sql";
const CI_WORKFLOW = ".github/workflows/ci.yml";
const E2E_FILES = [
  "packages/activerecord-cli/src/__e2e__/mysql-happy-path.test.ts",
  "packages/activerecord-cli/src/__e2e__/postgres-happy-path.test.ts",
];

/**
 * Temporary databases `connection-adapters/postgresql/schema-statements.test.ts`
 * creates through the postgres role, whose `CREATEDB` is not per-database. No
 * MySQL grant covers them by design.
 */
const POSTGRES_ONLY_DATABASES = ["trails_test_drop_db_tmp", "trails_test_recreate_tmp"];

const readRepoFile = (relative: string): Promise<string> =>
  readFile(path.join(REPO_ROOT, relative), "utf8");

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The database-name patterns the file's `GRANT ... ON <pattern>.*` statements name. */
function grantedPatterns(sql: string): string[] {
  const patterns = new Set<string>();
  for (const match of sql.matchAll(/GRANT\s+[^;]*?\sON\s+(`(?:[^`]|``)+`|[^\s.`]+)\.\*/gi)) {
    const raw = match[1];
    patterns.add(raw.startsWith("`") ? raw.slice(1, -1).replace(/``/g, "`") : raw);
  }
  return [...patterns];
}

/**
 * Whether a database-level GRANT on `pattern` authorizes `database`. MySQL reads
 * `_` and `%` in such a pattern as LIKE wildcards unless they are
 * backslash-escaped (dev.mysql.com/doc/en/grant.html), so
 * `activerecord\_unittest%` covers `activerecord_unittest2` but not
 * `activerecordXunittest_1`.
 */
function grantMatches(pattern: string, database: string): boolean {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "\\" && i + 1 < pattern.length) {
      source += escapeRegExp(pattern[++i]);
    } else if (char === "_") {
      source += ".";
    } else if (char === "%") {
      source += ".*";
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`^${source}$`).test(database);
}

/**
 * The `ar_cli_e2e_<hrtime>` prefix the CLI E2E suites hand to `ar db:create`,
 * read out of the suites themselves so renaming it fails here rather than on
 * the MySQL legs.
 */
async function e2eDatabasePrefixes(): Promise<string[]> {
  const prefixes: string[] = [];
  for (const file of E2E_FILES) {
    const source = await readRepoFile(file);
    const match = /`([a-z0-9_]+_)\$\{process\.hrtime\.bigint\(\)\}`/.exec(source);
    expect(
      match,
      `no <prefix>_\${process.hrtime.bigint()} database name in ${file}`,
    ).not.toBeNull();
    prefixes.push(match![1]);
  }
  return prefixes;
}

/**
 * Every shape the harness names a database of, given the base the CI services
 * provision: the bare base (no run token stamped), `slotDatabaseName`'s
 * `<base>_<token>_<slot>` and the un-tokened `<base>_<slot>`
 * (support/run-token.ts, support/config.ts), and the arunit2 sibling `<base>2`
 * with its own slot form (support/arunit2-config.ts).
 */
function harnessDatabases(base: string): string[] {
  return [base, `${base}_2`, `${base}_rm1z9x4q7k_1`, `${base}2`, `${base}2_3`];
}

/** The base database names the MySQL and MariaDB CI jobs provision and connect to. */
async function ciMysqlBaseDatabases(): Promise<string[]> {
  const yml = await readRepoFile(CI_WORKFLOW);
  const bases = new Set<string>();
  for (const match of yml.matchAll(/^\s*(?:MYSQL|MARIADB)_DATABASE:\s*(\S+)$/gm)) {
    bases.add(match[1]);
  }
  for (const match of yml.matchAll(/^\s*MYSQL_TEST_URL:\s*mysql:\/\/[^/\s]+\/(\S+)$/gm)) {
    bases.add(match[1]);
  }
  expect(bases.size, `no MySQL database names in ${CI_WORKFLOW}`).toBeGreaterThan(0);
  return [...bases];
}

describe("mysql grant namespaces", () => {
  it("grants every database name the suites create", async () => {
    const patterns = grantedPatterns(await readRepoFile(GRANT_FILE));
    expect(patterns.length).toBeGreaterThan(0);

    const databases = [
      ...(await ciMysqlBaseDatabases()).flatMap(harnessDatabases),
      ...(await e2eDatabasePrefixes()).map((prefix) => `${prefix}1234567890`),
    ];

    for (const database of databases) {
      expect(
        patterns.some((pattern) => grantMatches(pattern, database)),
        `the rails test user cannot create \`${database}\`: no GRANT in ${GRANT_FILE} covers it. ` +
          `Granted namespaces: ${patterns.join(", ")}. Add a grant there (for both 'rails'@'%' ` +
          `and 'rails'@'localhost') or rename the database into an existing namespace.`,
      ).toBe(true);
    }
  });

  it("leaves the postgres-only temporary databases ungranted", async () => {
    const patterns = grantedPatterns(await readRepoFile(GRANT_FILE));
    for (const database of POSTGRES_ONLY_DATABASES) {
      expect(patterns.some((pattern) => grantMatches(pattern, database))).toBe(false);
    }
  });

  it("reads unescaped underscore and percent as LIKE wildcards", () => {
    expect(grantMatches("activerecord\\_unittest%", "activerecord_unittest")).toBe(true);
    expect(grantMatches("activerecord\\_unittest%", "activerecord_unittest2")).toBe(true);
    expect(grantMatches("activerecord\\_unittest%", "activerecordXunittest_1")).toBe(false);
    expect(grantMatches("activerecord\\_unittest%", "xactiverecord_unittest")).toBe(false);
    expect(
      grantMatches("inexistent_activerecord_unittest", "inexistentXactiverecordXunittest"),
    ).toBe(true);
    expect(grantMatches("ar\\_cli\\_e2e%", "ar_cli_e2e_1234")).toBe(true);
    expect(grantMatches("ar\\_cli\\_e2e%", "arXcliXe2e_1234")).toBe(false);
  });

  it("parses backticked and bare grant patterns out of the grant file", async () => {
    const patterns = grantedPatterns(await readRepoFile(GRANT_FILE));
    expect(patterns).toContain("activerecord\\_unittest%");
    expect(patterns).toContain("inexistent_activerecord_unittest");
    expect(patterns).toContain("ar\\_cli\\_e2e%");
  });
});
