/**
 * Mirrors Rails ActiveRecord::ConnectionAdapters::PostgreSQL::Utils
 * and ActiveRecord::ConnectionAdapters::PostgreSQL::Name
 *
 * Re-exports from the canonical connection-adapters location.
 */

export {
  Name as PgName,
  splitQuotedIdentifier,
  Utils,
} from "../../connection-adapters/postgresql/utils.js";

import { Utils } from "../../connection-adapters/postgresql/utils.js";

export function extractSchemaQualifiedName(name: string) {
  return Utils.extractSchemaQualifiedName(name);
}
