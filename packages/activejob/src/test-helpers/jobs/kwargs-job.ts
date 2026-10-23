import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { JobBuffer } from "../../test-helpers/support/job-buffer.js";

export class KwargsJob extends Base {
  static toString(): string {
    return "KwargsJob";
  }

  perform({ argument = 1 }: { argument?: unknown } = {}) {
    return JobBuffer.add(`Job with argument: ${argument}`);
  }
}
registerConstant("KwargsJob", KwargsJob);
