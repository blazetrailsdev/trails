import { RuleTester } from "eslint";
import rule from "./no-raw-sql.mjs";

// Point the rule at a non-existent exclude baseline so the committed list
// never grandfathers these synthetic fixtures.
process.env.NO_RAW_SQL_EXCLUDE_PATH = "/nonexistent-exclude.json";

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

const IN = "packages/activerecord/src/relation.ts";
const ADAPTER = "packages/activerecord/src/connection-adapters/sqlite.ts";

tester.run("no-raw-sql", rule, {
  valid: [
    // Non-sink SQL-looking string (e.g. an error message) is left alone.
    { code: 'throw new Error("SELECT failed for the given relation");', filename: IN },
    // Sink call with a non-literal argument (the arel-built happy path).
    { code: "connection.execute(arel.toSql());", filename: IN },
    // SQL string passed to a non-sink call.
    { code: 'logger.debug("SELECT * FROM posts");', filename: IN },
    // Identical sink call inside connection-adapters/ — that layer renders SQL.
    { code: 'connection.execute("SELECT * FROM posts");', filename: ADAPTER },
    // Same allowed in the adapters/ layer.
    {
      code: 'connection.execute("DROP TABLE posts");',
      filename: "packages/activerecord/src/adapters/abstract.ts",
    },
    // schema-*.ts (DDL dumper/migration) legitimately renders SQL.
    {
      code: 'connection.execute("CREATE TABLE posts (id integer)");',
      filename: "packages/activerecord/src/schema-dumper.ts",
    },
    // Test files are out of scope.
    {
      code: 'connection.execute("SELECT * FROM posts");',
      filename: "packages/activerecord/src/relation.test.ts",
    },
    // Surgery on a variable that isn't named `sql`.
    { code: 'query.replace(/LIMIT \\d+/, "");', filename: IN },
    // String that doesn't start with a SQL verb.
    { code: 'connection.execute("PRAGMA foreign_keys = ON");', filename: IN },
    // A SQL verb only as a substring (not anchored at the start) is not flagged.
    { code: 'connection.execute(table + " SELECT");', filename: IN },
    // `.replaceAll` on `sql` is not the targeted surgery API.
    { code: 'sql.replaceAll("x", "y");', filename: IN },
    // Surgery API on a member, not a bare `sql` variable.
    { code: 'this.sql.replace(/x/, "");', filename: IN },
  ],
  invalid: [
    // String literal passed to an execution sink.
    {
      code: 'connection.execute("SELECT * FROM posts");',
      filename: IN,
      errors: [{ messageId: "noRawSql", data: { sink: "execute" } }],
    },
    // Template literal with interpolation, anchored on the first quasi.
    {
      code: "connection.selectAll(`SELECT ${cols} FROM posts`);",
      filename: IN,
      errors: [{ messageId: "noRawSql", data: { sink: "selectAll" } }],
    },
    // Leading whitespace before the verb is still flagged.
    {
      code: 'connection.execUpdate("  UPDATE posts SET x = 1");',
      filename: IN,
      errors: [{ messageId: "noRawSql", data: { sink: "execUpdate" } }],
    },
    // RFC-0022 string surgery: sql.replace(...)
    {
      code: 'sql.replace(/LIMIT \\d+/, "");',
      filename: IN,
      errors: [{ messageId: "noSqlSurgery", data: { method: "replace" } }],
    },
    // RFC-0022 string surgery: sql.concat(...)
    {
      code: 'sql.concat(" ORDER BY id");',
      filename: IN,
      errors: [{ messageId: "noSqlSurgery", data: { method: "concat" } }],
    },
    // Lowercase verb is matched case-insensitively.
    {
      code: 'connection.exec("delete from posts where id = 1");',
      filename: IN,
      errors: [{ messageId: "noRawSql", data: { sink: "exec" } }],
    },
    // Computed-member sink: connection["query"]("INSERT …").
    {
      code: 'connection["query"]("INSERT INTO posts (id) VALUES (1)");',
      filename: IN,
      errors: [{ messageId: "noRawSql", data: { sink: "query" } }],
    },
    // SQL string in a non-leading argument position is still flagged.
    {
      code: 'connection.selectValue(binds, "SELECT COUNT(*) FROM posts");',
      filename: IN,
      errors: [{ messageId: "noRawSql", data: { sink: "selectValue" } }],
    },
  ],
});

// Grandfathering: a file listed in the committed baseline is a no-op even when
// it contains a flaggable raw-SQL call. Point the rule at a one-entry baseline
// to exercise the ratchet path without depending on the real committed list.
const FIXTURE = "packages/activerecord/src/grandfathered-fixture.ts";
process.env.NO_RAW_SQL_EXCLUDE_PATH = new URL(
  "./no-raw-sql-baseline-fixture.json",
  import.meta.url,
).pathname;
const grandfatherTester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});
grandfatherTester.run("no-raw-sql (grandfathered)", rule, {
  valid: [{ code: 'connection.execute("SELECT * FROM posts");', filename: FIXTURE }],
  invalid: [],
});
