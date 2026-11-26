const DATA =
  '{"packages/sqlite3/lib/database.ts":["_setStringPragma","_tweakDefault","_versionCompare","setStringPragma","tweakDefault","versionCompare"],"packages/sqlite3/lib/errors.ts":["_sqlError","sqlError"],"packages/sqlite3/lib/pragmas.ts":["_setStringPragma","_tweakDefault","_versionCompare","setStringPragma","tweakDefault","versionCompare"],"packages/sqlite3/lib/statement.ts":["_getMetadata","getMetadata"]}';

let parsed: Record<string, readonly string[]> | undefined;

export function railsPrivateMethods(): Readonly<Record<string, readonly string[]>> {
  parsed ??= JSON.parse(DATA) as Record<string, readonly string[]>;
  return parsed;
}
