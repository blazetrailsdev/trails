import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { loadCanonicalSchema } from "./canonical-schema.js";

/**
 * Port of `LoadSchemaHelper#load_schema`
 * (vendor/rails/activerecord/test/support/load_schema_helper.rb:4-21), arm by
 * arm:
 *
 * - `load SCHEMA_ROOT + "/schema.rb"` → `loadCanonicalSchema`. trails' mirror of
 *   schema.rb is the canonical registry rather than a loadable Ruby file, so
 *   `load` means laying that registry onto the database.
 * - `load adapter_specific_schema_file if File.exist?(...)` → nothing to load.
 *   The content Rails' `<adapter>_specific_schema.rb` files carry is expressed
 *   inside the canonical registry through the same inline `current_adapter?`
 *   gating schema.rb uses (`emitTableIndexes`'s `opts.adapters` check and
 *   `TableBuilder`'s MySQL index-length arm in canonical-schema.ts), so
 *   `loadCanonicalSchema` has already applied it and there is no separate file
 *   whose existence to test. A future standalone adapter-specific schema module
 *   loads here, between the schema lay and the fixture-cache reset.
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
}
