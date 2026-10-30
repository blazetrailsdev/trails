import { fromPathname } from "./rake-module.js";
import { Task } from "./task.js";

export class FileTask extends Task {
  static override scopeName(_scope: unknown, taskName: string): string {
    return fromPathname(taskName) as string;
  }
}
