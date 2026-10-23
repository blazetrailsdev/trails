import { rbObjAsString, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { JobBuffer } from "../support/job-buffer.js";

export class MultipleKwargsJob extends Base {
  static toString(): string {
    return "MultipleKwargsJob";
  }

  perform({ argument1, argument2 }: { argument1: unknown; argument2: unknown }): void {
    JobBuffer.add(
      `Job with argument1: ${rbObjAsString(argument1)}, argument2: ${rbObjAsString(argument2)}`,
    );
  }
}
registerConstant("MultipleKwargsJob", MultipleKwargsJob);
