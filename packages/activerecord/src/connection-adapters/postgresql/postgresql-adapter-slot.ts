// Late-bound PostgreSQLAdapter class slot, extracted into a module with ZERO
// imports so it cannot participate in any import cycle.
//
// Why this exists: `PostgreSQL::TableDefinition#initialize` names
// `ActiveRecord::ConnectionAdapters::PostgreSQLAdapter.create_unlogged_tables`
// (postgresql/schema_definitions.rb:254), which Ruby resolves when the
// constructor runs. A TS `import` of `postgresql-adapter.js` from
// `postgresql/schema-definitions.ts` would instead be an eager edge back into
// the module that already value-imports this one, closing a cycle.
//
// `postgresql-adapter.ts` sets this at the bottom of its own body;
// `schema-definitions.ts` reads it at construction time, exactly where Ruby
// resolves the constant.
//
// The shape itself — and why the alternatives do not work — is written down
// once in CLAUDE.md, "Call-time constant resolution (Ruby autoload → the
// zero-import slot)".

/** @internal */
export let _PostgreSQLAdapterClass: { createUnloggedTables: boolean } | undefined;

/** @internal */
export function _setPostgreSQLAdapterClass(klass: { createUnloggedTables: boolean }): void {
  _PostgreSQLAdapterClass = klass;
}
