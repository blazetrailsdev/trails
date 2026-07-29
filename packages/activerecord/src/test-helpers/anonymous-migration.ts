import { Migration } from "../migration.js";

/**
 * Build a throwaway `Migration` with the given `up` / `down` bodies — the
 * trails stand-in for Rails' `Class.new(ActiveRecord::Migration::Current) { def
 * up; …; end }`, which its migrator tests hand to a `MigrationProxy`. Tests
 * must give `Migrator` a real `Migration`: `MigrationProxy#load_migration`
 * (`migration.rb:1195`) always yields one, and `name` / `version` are the
 * `name.constantize.new(name, version)` identity the banner prints.
 */
export function anonymousMigration(
  name?: string,
  version?: string,
  up: (m: Migration) => Promise<void> = async () => {},
  down: (m: Migration) => Promise<void> = async () => {},
): Migration {
  return new (class extends Migration {
    override async up(): Promise<void> {
      await up(this);
    }
    override async down(): Promise<void> {
      await down(this);
    }
  })(name, version);
}
