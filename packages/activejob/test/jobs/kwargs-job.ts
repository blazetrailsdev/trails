import { rbObjAsString, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";
import { JobBuffer } from "../support/job-buffer.js";
export class KwargsJob extends Base {
  static toString(): string {
    return "KwargsJob";
  }

  perform({ argument = 1 }: { argument?: unknown } = {}): void {
    JobBuffer.add(`Job with argument: ${rbObjAsString(argument)}`);
  }
}
constSet(TopLevel, "KwargsJob", KwargsJob);
