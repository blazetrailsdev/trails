import { RuleTester } from "eslint";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// Hermetic fixture: point the rule at a tmp manifest snapshot via the env
// override it reads lazily, so the test never touches the committed one.
const MANIFEST_FIXTURE = path.join(__dirname, ".tmp-rails-tosql-classes.test.json");

const manifest = {
  generatedAt: "test",
  packages: {
    activerecord: [
      { name: "Relation", methods: ["toSql"], rubyFile: "relation.rb", tsFile: "relation.ts" },
      {
        name: "DatabaseStatements",
        methods: ["toSql", "toSqlAndBinds"],
        rubyFile: "connection_adapters/abstract/database_statements.rb",
        tsFile: "connection-adapters/abstract/database-statements.ts",
      },
    ],
    arel: [
      { name: "Node", methods: ["toSql"], rubyFile: "nodes/node.rb", tsFile: "nodes/node.ts" },
      {
        name: "TreeManager",
        methods: ["toSql"],
        rubyFile: "tree_manager.rb",
        tsFile: "tree-manager.ts",
      },
    ],
  },
};

fs.writeFileSync(MANIFEST_FIXTURE, JSON.stringify(manifest, null, 2));
process.env.RAILS_TOSQL_CLASSES_PATH = MANIFEST_FIXTURE;

process.on("exit", () => {
  fs.rmSync(MANIFEST_FIXTURE, { force: true });
});

// Imported after the env vars are set; the rule resolves the paths lazily so
// ESM hoisting of this import is harmless.
const { default: rule } = await import("./rails-arel-tosql.mjs");

const relationFile = path.join(REPO_ROOT, "packages/activerecord/src/relation.ts");
const builderFile = path.join(REPO_ROOT, "packages/activerecord/src/sql-builder.ts");
const nodeFile = path.join(REPO_ROOT, "packages/arel/src/nodes/node.ts");
const managerFile = path.join(REPO_ROOT, "packages/arel/src/tree-manager.ts");
const dbStmtFile = path.join(
  REPO_ROOT,
  "packages/activerecord/src/connection-adapters/abstract/database-statements.ts",
);

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

tester.run("rails-arel-tosql", rule, {
  valid: [
    // Counterpart HAS to_sql → toSql allowed.
    { filename: relationFile, code: `export class Relation { toSql() { return ""; } }\n` },
    // Arel managers/visitors pass via the manifest allow-set.
    { filename: nodeFile, code: `export abstract class Node { toSql() { return ""; } }\n` },
    { filename: managerFile, code: `export class TreeManager { get toSql() { return ""; } }\n` },
    // toSqlAndBinds allowed where the Rails counterpart defines it.
    {
      filename: dbStmtFile,
      code: `export class DatabaseStatements { toSqlAndBinds(a) { return [a]; } }\n`,
    },
    // A method named toSql on a class with NO toSql counterpart but in a
    // different (non-class) position — plain function — is not flagged.
    { filename: builderFile, code: `function toSql() { return "x"; }\n` },
    // Type-only declaration (`declare toSql`) is not a definition.
    { filename: builderFile, code: `export class SqlBuilder { declare toSql: () => string; }\n` },
    // Object-literal method (not a class) is not flagged.
    { filename: builderFile, code: `export const o = { toSql() { return "x"; } };\n` },
    // Out-of-scope file is ignored entirely.
    {
      filename: path.join(REPO_ROOT, "packages/activesupport/src/x.ts"),
      code: `export class Foo { toSql() { return ""; } }\n`,
    },
  ],
  invalid: [
    // Counterpart LACKS to_sql → bespoke toSql is flagged.
    {
      filename: builderFile,
      code: `export class SqlBuilder { toSql() { return "SELECT *"; } }\n`,
      errors: [{ messageId: "bespokeToSql" }],
    },
    // Getter form is flagged too.
    {
      filename: builderFile,
      code: `export class SqlBuilder { get toSql() { return "SELECT *"; } }\n`,
      errors: [{ messageId: "bespokeToSql" }],
    },
    // Static form is flagged.
    {
      filename: builderFile,
      code: `export class SqlBuilder { static toSql() { return "SELECT *"; } }\n`,
      errors: [{ messageId: "bespokeToSql" }],
    },
    // Arrow-property form is flagged.
    {
      filename: builderFile,
      code: `export class SqlBuilder { toSql = () => "SELECT *"; }\n`,
      errors: [{ messageId: "bespokeToSql" }],
    },
    // toSqlAndBinds on a class whose counterpart defines only toSql is flagged.
    {
      filename: relationFile,
      code: `export class Relation { toSqlAndBinds() { return []; } }\n`,
      errors: [{ messageId: "bespokeToSql" }],
    },
    // Anonymous class with toSql is flagged.
    {
      filename: builderFile,
      code: `const C = class { toSql() { return "x"; } };\n`,
      errors: [{ messageId: "anonToSql" }],
    },
    // Cross-package non-leakage: `Node` is allowed in arel but NOT in
    // activerecord, so a bespoke `Node.toSql` in activerecord is flagged.
    {
      filename: path.join(REPO_ROOT, "packages/activerecord/src/node.ts"),
      code: `export class Node { toSql() { return "x"; } }\n`,
      errors: [{ messageId: "bespokeToSql" }],
    },
    // Mixin idiom: `static toSql = importedFn` assigns a `this`-typed function
    // to the class — a bespoke definition, so it's flagged.
    {
      filename: builderFile,
      code: `import { toSqlImpl } from "./impl.js";\nexport class SqlBuilder { static toSql = toSqlImpl; }\n`,
      errors: [{ messageId: "bespokeToSql" }],
    },
  ],
});

console.log("rails-arel-tosql: ok");
