/**
 * PostgreSQL schema statements — PostgreSQL-specific DDL operations.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements
 */

export interface CreateDatabaseOptions {
  encoding?: string;
  collation?: string;
  ctype?: string;
  owner?: string;
  template?: string;
  tablespace?: string;
  connectionLimit?: number;
}
