/**
 * The catalogue relations `require-canonical-rebuild` recognises as able to
 * hand a sweep the NAME of a table it can then drop.
 *
 * This list used to be an inline alternation in the rule, and it rotted
 * silently: `pragma_table_list` was missing until review round 2 of PR #5519
 * caught it, which would have left the whole SQLite lane blind. Splitting it
 * out gives `canonical-catalogue-sources.test.mjs` something to check the repo
 * against — every catalogue relation read anywhere under `packages/` must
 * appear in exactly one of the two lists here, so a new adapter query against
 * an unlisted catalogue fails the test instead of quietly widening the gap.
 *
 * Membership is decided by ONE question: can a `SELECT` against this relation
 * return a table name? Not "is it a system catalogue" — `pg_type` and
 * `information_schema.columns` are catalogues too, but a sweep cannot choose a
 * table to drop from them, so a canonical name appearing near one is not the
 * shape the rule hunts.
 */

/** Relations from which a `SELECT` can return a table name. */
export const TABLE_NAME_CATALOGUES = [
  "pg_tables",
  "pg_class",
  "pg_views",
  "pg_matviews",
  "pg_indexes",
  "sqlite_master",
  "sqlite_schema",
  "sqlite_temp_master",
  "sqlite_sequence",
  "pragma_table_list",
  "information_schema.tables",
  "information_schema.views",
  "information_schema.table_constraints",
  "information_schema.key_column_usage",
  "information_schema.referential_constraints",
  "information_schema.statistics",
];

/**
 * Relations read under `packages/` that CANNOT name a table, with the reason.
 * Kept as data rather than left unlisted so that the test's "classified
 * exactly once" check has something to pass, and so a future reader can see
 * the call was made deliberately.
 */
export const NON_TABLE_CATALOGUES = {
  pg_am: "index access methods; no relation name column",
  pg_attrdef: "column defaults, keyed by attrelid oid rather than a name",
  pg_attribute: "columns; attrelid is an oid, joined to pg_class to get a name",
  pg_available_extensions: "extension names",
  pg_cast: "cast pairs, all type oids",
  pg_catalog: "the schema qualifier, not a relation",
  pg_collation: "collation names",
  pg_constraint: "constraint names; conrelid is an oid, not a table name",
  pg_database: "database names",
  pg_depend: "oid pairs",
  pg_description: "comments, keyed by objoid",
  pg_enum: "enum labels",
  pg_extension: "extension names",
  pg_get_indexdef: "a function, not a relation",
  pg_index: "index/table oids, never names",
  pg_locks: "lock rows keyed by relation oid",
  pg_namespace: "schema names",
  pg_prepared_statements: "prepared statement names and their SQL",
  pg_proc: "function names",
  pg_range: "range type oids",
  pg_sequence: "sequence oids",
  pg_stat_activity: "backend sessions",
  pg_terminate_backend: "a function, not a relation",
  pg_type: "type names",
  pragma_table_info: "columns of ONE table named by the caller; enumerates nothing",
  "information_schema.check_constraints": "constraint names and their clauses",
  "information_schema.columns": "see the note below",
  "information_schema.schemata": "schema names",

  // Test tables that merely start with a catalogue prefix. They are ordinary
  // tables created by a test, not catalogues.
  pg_arrays: "a test table, not a catalogue",
  pg_dates_inf: "a test table, not a catalogue",
  sqlite_specific_schema: "a test table, not a catalogue",
};

/**
 * `information_schema.columns` is the one deliberate judgement call above: it
 * DOES carry a `table_name` column, so `SELECT DISTINCT table_name FROM
 * information_schema.columns` would enumerate tables. It is excluded because
 * every one of its reads in this repo is a column probe (`WHERE table_name =
 * $1`), and listing it would arm the sweep check on all of them — turning a
 * column-introspection test into a report with no drop loop anywhere near it.
 * A sweep that really chose its victims this way would be missed; that is an
 * accepted, recorded gap rather than an unexamined one.
 */
export const CATALOGUE_SOURCE = new RegExp(
  `\\b(?:${TABLE_NAME_CATALOGUES.map((n) => n.replace(".", "\\.")).join("|")})\\b|\\bshow\\s+tables\\b`,
  "i",
);
