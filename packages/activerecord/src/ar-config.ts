import { Thread } from "@blazetrails/ruby-compat";
/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
 */
export function isSchemaCacheIgnoredTable(tableName: string): boolean {
  for (const entry of ActiveRecord.schemaCacheIgnoredTables) {
    if (entry instanceof RegExp) {
      entry.lastIndex = 0;
      if (entry.test(tableName)) return true;
    } else if (entry === tableName) {
      return true;
    }
  }
  return false;
}

let _indexNestedAttributeErrors = false;
let _schemaCacheIgnoredTables: ReadonlyArray<string | RegExp> = [];

/** @noRailsEquivalent PERMANENT */
export class AsyncExecutor {
  post(task: () => void): void {
    queueMicrotask(() => void new Thread(task));
  }
}
let _writingRole = "writing";
let _readingRole = "reading";

export const ActiveRecord = {
  /** @internal */
  get indexNestedAttributeErrors(): boolean {
    return _indexNestedAttributeErrors;
  },

  /** @internal */
  set indexNestedAttributeErrors(value: boolean) {
    _indexNestedAttributeErrors = value;
  },

  /** @internal */
  get schemaCacheIgnoredTables(): ReadonlyArray<string | RegExp> {
    return _schemaCacheIgnoredTables;
  },

  /** @internal */
  set schemaCacheIgnoredTables(value: ReadonlyArray<string | RegExp>) {
    _schemaCacheIgnoredTables = value;
  },

  get writingRole(): string {
    return _writingRole;
  },

  set writingRole(value: string) {
    _writingRole = value;
  },

  get readingRole(): string {
    return _readingRole;
  },

  set readingRole(value: string) {
    _readingRole = value;
  },
};
