import { DatabaseTasks } from "../tasks/database-tasks.js";

export function clearRegisteredTasks(): void {
  (DatabaseTasks as unknown as { _registeredTasks: unknown[] })._registeredTasks = [];
}
