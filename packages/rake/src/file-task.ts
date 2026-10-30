import { cmp, Errno, File } from "@blazetrails/ruby-compat";
import { LATE } from "./late-time.js";
import { fromPathname } from "./rake-module.js";
import type { Scope } from "./scope.js";
import { Task, type Timestamp } from "./task.js";

export class FileTask extends Task {
  override async isNeeded(): Promise<boolean | undefined> {
    try {
      return (
        (await this.isOutOfDate(await File.mtimeAsync(this.name))) ||
        this.application.options.buildAll
      );
    } catch (e) {
      if (e instanceof Errno.ENOENT) return true;
      throw e;
    }
  }

  override async timestamp(): Promise<Timestamp> {
    try {
      return await File.mtimeAsync(this.name);
    } catch (e) {
      if (e instanceof Errno.ENOENT) return LATE;
      throw e;
    }
  }

  /** @internal */
  private async isOutOfDate(stamp: Date): Promise<boolean | undefined> {
    for (const prereq of await this.allPrerequisiteTasks()) {
      const prereqTask = (await this.application.get(String(prereq), this.scope))!;
      const klass: unknown = prereqTask.constructor;
      if (klass === FileTask) {
        if (cmp(await prereqTask.timestamp(), stamp)! > 0 || this.application.options.buildAll) {
          return true;
        }
      } else if (cmp(await prereqTask.timestamp(), stamp)! > 0) {
        return true;
      }
    }
    return false;
  }

  static override scopeName(scope: Scope, taskName: string): string {
    return fromPathname(taskName) as string;
  }
}
