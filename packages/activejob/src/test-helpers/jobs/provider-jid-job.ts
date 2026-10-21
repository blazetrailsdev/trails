import { rbObjAsString, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { JobBuffer } from "../support/job-buffer.js";
export class ProviderJidJob extends Base {
  static toString(): string {
    return "ProviderJidJob";
  }

  perform(): void {
    JobBuffer.add(`Provider Job ID: ${rbObjAsString(this.providerJobId)}`);
  }
}
registerConstant("ProviderJidJob", ProviderJidJob);
