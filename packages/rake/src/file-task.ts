import { cmp, Errno, File, rbCmpint, rbObjClass } from "@blazetrails/ruby-compat";
import { LATE } from "./late-time.js";
import { fromPathname } from "./rake-module.js";
import type { Scope } from "./scope.js";
import { Task, type Timestamp } from "./task.js";

export class FileTask extends Task {
  override async isNeeded(): Promise<boolean> {
    try {
      return (
        (await this.isOutOfDate(await File.mtimeAsync(this.name))) ||
        (this.application.options.buildAll ?? false)
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
  private async isOutOfDate(stamp: Date): Promise<boolean> {
    for (const prereq of await this.allPrerequisiteTasks()) {
      const prereqTask = (await this.application.get(String(prereq), this.scope))!;
      const timestamp = await prereqTask.timestamp();
      if (rbObjClass(prereqTask) === FileTask) {
        if (rbCmpint(cmp(timestamp, stamp), timestamp, stamp) > 0) return true;
        if (this.application.options.buildAll) return true;
      } else if (rbCmpint(cmp(timestamp, stamp), timestamp, stamp) > 0) {
        return true;
      }
    }
    return false;
  }

  static override scopeName(scope: Scope, taskName: string): string {
    return fromPathname(taskName) as string;
  }
}
