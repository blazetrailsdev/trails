/** @internal */

import { splitRunDatabaseName } from "./run-token.js";

export function arunitDatabaseNames(primaryDatabase: string): {
  arunit: string;
  arunit2: string;
} {
  const { base, suffix } = splitRunDatabaseName(primaryDatabase);
  return { arunit: primaryDatabase, arunit2: `${base}2${suffix}` };
}
