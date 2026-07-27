import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { loadCanonicalSchema } from "./canonical-schema.js";

/**
 * Port of `LoadSchemaHelper#load_schema`
 * (vendor/rails/activerecord/test/support/load_schema_helper.rb:4-21).
 *
 * Rails' body has four parts: silence `$stdout`, `load SCHEMA_ROOT/schema.rb`,
 * `load` the adapter-specific schema file when it exists, and
 * `ActiveRecord::FixtureSet.reset_cache`. Each is handled below; the
 * dispositions that differ from Rails are justified at the line they affect.
 *
 * The stdout-silencing arm has no counterpart: `load`ing a Ruby schema file
 * prints every migration line, whereas laying the canonical schema here issues
 * DDL through the adapter and prints nothing.
 */
export async function loadSchema(adapter: DatabaseAdapter): Promise<void> {
  // `load SCHEMA_ROOT + "/schema.rb"`. trails' mirror of schema.rb is
  // `test-helpers/test-schema.ts` / the canonical registry rather than a
  // loadable Ruby file, so the equivalent of `load` is laying that registry
  // onto the database.
  await loadCanonicalSchema(adapter);

  // `load adapter_specific_schema_file if File.exist?(...)`. trails has no
  // `<adapter>_specific_schema` module to conditionally load: the per-adapter
  // schema content those Rails files carry is expressed inside the canonical
  // registry itself, through the same inline `current_adapter?` gating schema.rb
  // uses (`emitTableIndexes`'s `opts.adapters` check and `TableBuilder`'s MySQL
  // index-length arm in canonical-schema.ts). So `loadCanonicalSchema` above has
  // already applied it, and there is no separate file whose existence to test.
  // If trails ever grows a standalone adapter-specific schema module, loading it
  // belongs here, between the schema lay and the fixture-cache reset.

  // `ActiveRecord::FixtureSet.reset_cache` (fixtures.rb:556) clears
  // `@@all_cached_fixtures`, the per-connection-pool cache Rails fills in
  // `FixtureSet.create_fixtures` (fixtures.rb:611) so a re-loaded schema cannot
  // be served rows built against the old one. trails' `FixtureSet.createFixtures`
  // delegates straight to `defineFixtures`, which inserts and caches nothing, so
  // there is no cache to clear — the arm is genuinely empty here rather than
  // unimplemented.
}
