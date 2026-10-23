import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { JobBuffer } from "../../test-helpers/support/job-buffer.js";
import type { Person as Person2 } from "../models/person.js";

export class GidJob extends Base {
  static toString(): string {
    return "GidJob";
  }

  perform(person: Person2) {
    return JobBuffer.add(`Person with ID: ${person.id ?? ""}`);
  }
}
registerConstant("GidJob", GidJob);
