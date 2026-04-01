/**
 * MySQL schema dumper — MySQL-specific schema dump logic.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaDumper
 */

import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";

export class SchemaDumper extends AbstractSchemaDumper {
  defaultPrimaryKeyType(): string {
    return "bigint";
  }
}
