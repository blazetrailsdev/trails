/**
 * Option/result shapes for PostgreSQL-specific DDL operations. The statements
 * themselves live on PostgreSQLSchemaStatements (./schema-statements-class.ts),
 * mirroring ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements.
 */

export interface PgIndexDefinition {
  table: string;
  name: string;
  unique: boolean;
  // A string for expression indexes (the raw expression), an array of column
  // names otherwise — mirrors Rails' IndexDefinition#columns.
  columns: string | string[];
  using: string;
  orders?: Record<string, string> | string;
  opclasses?: Record<string, string> | string;
  include?: string[];
  where?: string;
  nullsNotDistinct?: boolean;
  comment?: string;
  valid: boolean;
}

export interface CreateDatabaseOptions {
  encoding?: string;
  collation?: string;
  ctype?: string;
  owner?: string;
  template?: string;
  tablespace?: string;
  connectionLimit?: number;
}
