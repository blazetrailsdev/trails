import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import type { TableDefinition as PgTableDefinition } from "../connection-adapters/postgresql/schema-definitions.js";
import type { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { loadCanonicalSchema } from "./canonical-schema.js";

/**
 * The ported slice of
 * `vendor/rails/activerecord/test/schema/postgresql_specific_schema.rb:4-16` —
 * the `uuid-ossp` / `pgcrypto` extension header and the `chat_messages` /
 * `chat_messages_custom_pk` uuid-primary-key tables. `uuid_default` there is
 * `{}` whenever `supports_pgcrypto_uuid?` (PG >= 9.4, always true on our
 * postgres lane), which leaves the uuid PK on the adapter's `gen_random_uuid()`
 * default.
 *
 * The rest of that file (`uuid_parents`, `uuid_children`, `defaults`,
 * `postgresql_times`, …) and the `mysql2_` / `sqlite_` specific schemas are not
 * ported yet; story `port-adapter-specific-schemas` covers them.
 */
async function loadPostgresqlSpecificSchema(adapter: PostgreSQLAdapter): Promise<void> {
  await adapter.enableExtension("uuid-ossp");
  await adapter.enableExtension("pgcrypto");

  await adapter.createTable("chat_messages", { id: "uuid", force: true }, (t) => {
    (t as PgTableDefinition).text("content");
  });

  await adapter.createTable("chat_messages_custom_pk", { id: false, force: true }, (t) => {
    const pg = t as PgTableDefinition;
    pg.uuid("message_id", { primaryKey: true, default: () => "uuid_generate_v4()" });
    pg.text("content");
  });
}

/**
 * The `File.exist?(adapter_specific_schema_file)` lookup of
 * `load_schema_helper.rb:10,15`: an adapter name resolves to its
 * `<adapter>_specific_schema` loader when trails has one, and to nothing when it
 * does not — the same false branch Rails takes for an adapter whose file is
 * absent.
 */
const ADAPTER_SPECIFIC_SCHEMAS: Record<string, (adapter: DatabaseAdapter) => Promise<void>> = {
  postgres: (adapter) => loadPostgresqlSpecificSchema(adapter as unknown as PostgreSQLAdapter),
};

/**
 * Port of `LoadSchemaHelper#load_schema`
 * (vendor/rails/activerecord/test/support/load_schema_helper.rb:4-21), arm by
 * arm:
 *
 * - `load SCHEMA_ROOT + "/schema.rb"` → `loadCanonicalSchema`. trails' mirror of
 *   schema.rb is the canonical registry rather than a loadable Ruby file, so
 *   `load` means laying that registry onto the database.
 * - `load adapter_specific_schema_file if File.exist?(...)` →
 *   {@link ADAPTER_SPECIFIC_SCHEMAS}.
 * - `ActiveRecord::FixtureSet.reset_cache` (fixtures.rb:556) clears
 *   `@@all_cached_fixtures`, which Rails fills in `FixtureSet.create_fixtures`
 *   (fixtures.rb:611) so a re-loaded schema cannot be served rows built against
 *   the old one. trails' `FixtureSet.createFixtures` delegates straight to
 *   `defineFixtures`, which caches nothing, so the arm is empty here rather than
 *   unimplemented.
 * - Silencing `$stdout` has no counterpart: `load`ing a Ruby schema file prints
 *   every migration line, whereas laying the schema through the adapter prints
 *   nothing.
 *
 * @internal Boot/template setup paths only. Test files wire the canonical schema
 * + fixtures through `fixtures({ ... })`; the
 * `blazetrails/no-internal-canonical-loaders` ESLint rule enforces that.
 */
export async function loadSchema(adapter: DatabaseAdapter): Promise<void> {
  await loadCanonicalSchema(adapter);

  const adapterSpecificSchema = ADAPTER_SPECIFIC_SCHEMAS[adapter.adapterName];
  if (adapterSpecificSchema) await adapterSpecificSchema(adapter);
}
