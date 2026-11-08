import { rbObjAsString, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../../lib/base.js";
import { JobBuffer } from "../job-buffer.js";
import type { Person } from "../../models/person.js";
export class GidJob extends Base {
  static toString(): string {
    return "GidJob";
  }

  perform(person: Person): void {
    JobBuffer.add(`Person with ID: ${rbObjAsString(person.id)}`);
  }
}
constSet(TopLevel, "GidJob", GidJob);
