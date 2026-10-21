import { rbObjAsString, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { JobBuffer } from "../support/job-buffer.js";
import type { Person } from "../models/person.js";
export class GidJob extends Base {
  static toString(): string {
    return "GidJob";
  }

  perform(person: Person): void {
    JobBuffer.add(`Person with ID: ${rbObjAsString(person.id)}`);
  }
}
registerConstant("GidJob", GidJob);
