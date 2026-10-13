import { DatabaseTasks } from "../tasks/database-tasks.js";
import "../tasks/mysql-database-tasks.js";
import "../tasks/postgresql-database-tasks.js";
import "../tasks/sqlite-database-tasks.js";

const registry = DatabaseTasks as unknown as { tasks: Map<unknown, unknown> };
const builtinTasks = new Map(registry.tasks);

export function resetRegisteredTasks(): void {
  registry.tasks = new Map(builtinTasks);
}
