/**
 * Migration error classes — factored into a standalone module so
 * `internal-metadata.ts` can import them without creating a circular
 * dependency with `migration.ts` (which itself imports InternalMetadata).
 *
 * `migration.ts` re-exports these, so existing consumers of
 * `@blazetrails/activerecord/migration` keep working.
 */

export class MigrationError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "MigrationError";
  }
}

export class IrreversibleMigration extends MigrationError {
  constructor(message = "This migration uses a feature that is not reversible.") {
    super(message);
    this.name = "IrreversibleMigration";
  }
}

export class DuplicateMigrationVersionError extends MigrationError {
  constructor(version: string | number) {
    super(`Duplicate migration version: ${version}`);
    this.name = "DuplicateMigrationVersionError";
  }
}

export class DuplicateMigrationNameError extends MigrationError {
  constructor(name: string) {
    super(`Duplicate migration name: ${name}`);
    this.name = "DuplicateMigrationNameError";
  }
}

export class UnknownMigrationVersionError extends MigrationError {
  constructor(version: string | number) {
    super(`No migration with version number ${version}.`);
    this.name = "UnknownMigrationVersionError";
  }
}

export class IllegalMigrationNameError extends MigrationError {
  constructor(name: string) {
    super(`Illegal name for migration file: ${name}.`);
    this.name = "IllegalMigrationNameError";
  }
}

export class InvalidMigrationTimestampError extends MigrationError {
  constructor(version: string | number) {
    super(`Invalid timestamp ${version} in migration file name.`);
    this.name = "InvalidMigrationTimestampError";
  }
}

export class PendingMigrationError extends MigrationError {
  constructor(message = "Migrations are pending. Run `migrate` to resolve.") {
    super(message);
    this.name = "PendingMigrationError";
  }
}

export class ConcurrentMigrationError extends MigrationError {
  constructor(message = "Cannot run migrations because another migration is currently running.") {
    super(message);
    this.name = "ConcurrentMigrationError";
  }
}

export class NoEnvironmentInSchemaError extends MigrationError {
  constructor(message = "Environment data not found in the schema.") {
    super(message);
    this.name = "NoEnvironmentInSchemaError";
  }
}

export class ProtectedEnvironmentError extends MigrationError {
  constructor(env: string) {
    super(`You are attempting to run a destructive action against your '${env}' database.`);
    this.name = "ProtectedEnvironmentError";
  }
}

export class EnvironmentMismatchError extends MigrationError {
  /**
   * Accept either a prebuilt message (one-arg) or `(current, stored)`
   * separately (two-arg) matching Rails'
   * `EnvironmentMismatchError.new(current:, stored:)`.
   */
  constructor(currentOrMessage?: string, stored?: string) {
    const message =
      stored !== undefined && currentOrMessage !== undefined
        ? `You are attempting to modify a database that was last run in \`${stored}\` environment.\n` +
          `You are running in \`${currentOrMessage}\` environment. ` +
          `If you are sure you want to continue, first set the environment using:\n\n` +
          `        trails db environment:set\n`
        : (currentOrMessage ?? "The environment does not match the stored environment.");
    super(message);
    this.name = "EnvironmentMismatchError";
  }
}

export class EnvironmentStorageError extends MigrationError {
  constructor(message = "Cannot store environment data.") {
    super(message);
    this.name = "EnvironmentStorageError";
  }
}
