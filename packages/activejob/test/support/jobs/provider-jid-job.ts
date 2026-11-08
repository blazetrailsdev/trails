import { rbObjAsString, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../../lib/base.js";
import { JobBuffer } from "../job-buffer.js";
export class ProviderJidJob extends Base {
  static toString(): string {
    return "ProviderJidJob";
  }

  perform(): void {
    JobBuffer.add(`Provider Job ID: ${rbObjAsString(this.providerJobId)}`);
  }
}
constSet(TopLevel, "ProviderJidJob", ProviderJidJob);
