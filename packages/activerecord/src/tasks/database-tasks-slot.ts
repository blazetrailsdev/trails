import type { DatabaseTasks } from "./database-tasks.js";

/** @internal */
export let _DatabaseTasks: typeof DatabaseTasks | undefined;

/** @internal */
export function _setDatabaseTasks(databaseTasks: typeof DatabaseTasks): void {
  _DatabaseTasks = databaseTasks;
}
