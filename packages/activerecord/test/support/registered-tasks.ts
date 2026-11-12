import { DatabaseTasks } from "../../lib/tasks/database-tasks.js";
import "../../lib/tasks/mysql-database-tasks.js";
import "../../lib/tasks/postgresql-database-tasks.js";
import "../../lib/tasks/sqlite-database-tasks.js";

const registry = DatabaseTasks as unknown as { tasks: Map<unknown, unknown> };
const builtinTasks = new Map(registry.tasks);

export function resetRegisteredTasks(): void {
  registry.tasks = new Map(builtinTasks);
}
