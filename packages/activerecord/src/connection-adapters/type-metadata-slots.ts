import type { TypeMetadata as MySQLTypeMetadata } from "./mysql/type-metadata.js";
import type { TypeMetadata as PostgreSQLTypeMetadata } from "./postgresql/type-metadata.js";

/** @internal */
export let _MySQLTypeMetadata: typeof MySQLTypeMetadata | undefined;

/** @internal */
export function _setMySQLTypeMetadata(klass: typeof MySQLTypeMetadata): void {
  _MySQLTypeMetadata = klass;
}

/** @internal */
export let _PostgreSQLTypeMetadata: typeof PostgreSQLTypeMetadata | undefined;

/** @internal */
export function _setPostgreSQLTypeMetadata(klass: typeof PostgreSQLTypeMetadata): void {
  _PostgreSQLTypeMetadata = klass;
}
