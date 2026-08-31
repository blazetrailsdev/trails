export { Name as PgName, Utils } from "../../connection-adapters/postgresql/utils.js";

import { Utils } from "../../connection-adapters/postgresql/utils.js";

export function extractSchemaQualifiedName(name: string) {
  return Utils.extractSchemaQualifiedName(name);
}
