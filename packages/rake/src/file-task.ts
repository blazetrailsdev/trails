import { fromPathname } from "./rake-module.js";
import type { Scope } from "./scope.js";
import { Task } from "./task.js";

export class FileTask extends Task {
  static override scopeName(scope: Scope, taskName: string): string {
    void scope;
    return fromPathname(taskName) as string;
  }
}
