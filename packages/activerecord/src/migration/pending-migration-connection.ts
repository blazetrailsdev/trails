/**
 * Pending migration connection — establishes a connection for checking pending migrations.
 *
 * Mirrors: ActiveRecord::PendingMigrationConnection
 */

export class PendingMigrationConnection {
  private _connectionName: string;

  constructor(connectionName = "primary") {
    this._connectionName = connectionName;
  }

  get connectionName(): string {
    return this._connectionName;
  }
}
