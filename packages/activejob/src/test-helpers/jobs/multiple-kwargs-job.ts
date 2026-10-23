import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { JobBuffer } from "../../test-helpers/support/job-buffer.js";

export class MultipleKwargsJob extends Base {
  static toString(): string {
    return "MultipleKwargsJob";
  }

  perform({ argument1, argument2 }: { argument1: unknown; argument2: unknown } = {}) {
    return JobBuffer.add(`Job with argument1: ${argument1 ?? ""}, argument2: ${argument2 ?? ""}`);
  }
}
registerConstant("MultipleKwargsJob", MultipleKwargsJob);
