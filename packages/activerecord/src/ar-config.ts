import { Thread } from "@blazetrails/ruby-compat";
let _indexNestedAttributeErrors = false;
let _schemaCacheIgnoredTables: ReadonlyArray<string | RegExp> = [];

/** @noRailsEquivalent PERMANENT */
export class AsyncExecutor {
  /** @noRailsEquivalent PERMANENT */
  post(task: () => void): void {
    queueMicrotask(() => void new Thread(task));
  }
}

/** @noRailsEquivalent CONVERGEABLE relocate-ar-config-seats-onto-base */
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
};
