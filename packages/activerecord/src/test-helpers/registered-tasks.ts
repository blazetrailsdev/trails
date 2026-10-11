import { DatabaseTasks } from "../tasks/database-tasks.js";
import "../tasks/mysql-database-tasks.js";
import "../tasks/postgresql-database-tasks.js";
import "../tasks/sqlite-database-tasks.js";

const registry = DatabaseTasks as unknown as { _registeredTasks: unknown[] };
const builtinTasks = [...registry._registeredTasks];

export function resetRegisteredTasks(): void {
  registry._registeredTasks = [...builtinTasks];
}
