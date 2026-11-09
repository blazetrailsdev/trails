import { File } from "@blazetrails/ruby-compat";
import { EARLY } from "./early-time.js";
import { FileTask } from "./file-task.js";
import type { Timestamp } from "./task.js";

export class FileCreationTask extends FileTask {
  override async isNeeded(): Promise<boolean> {
    return !(await File.isExistAsync(this.name));
  }

  override async timestamp(): Promise<Timestamp> {
    return EARLY;
  }
}
