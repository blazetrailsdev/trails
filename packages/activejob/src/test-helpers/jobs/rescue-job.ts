import {
  ArgumentError,
  block,
  NotImplementedError,
  rbModConstSet,
  rbModName,
  rbObjClass,
  registerConstant,
  StandardError,
} from "@blazetrails/ruby-compat";
import { DeserializationError } from "../../arguments.js";
import { Base } from "../../base.js";
import { JobBuffer } from "../support/job-buffer.js";

class OtherError extends StandardError {}

export class RescueJob extends Base {
  static toString(): string {
    return "RescueJob";
  }

  declare static OtherError: typeof OtherError;

  perform(person: unknown = "david"): void {
    switch (person) {
      case "david":
        throw new ArgumentError("Hair too good");
      case "other":
        throw new OtherError("Bad hair");
      case "rafael":
        throw new NotImplementedError("Hair is just perfect");
      default:
        JobBuffer.add("performed beautifully");
    }
  }
}
registerConstant("RescueJob", RescueJob);
rbModConstSet(RescueJob, "OtherError", OtherError);

RescueJob.rescueFrom(
  ArgumentError,
  block(async function (this: RescueJob) {
    JobBuffer.add("rescued from ArgumentError");
    this.arguments[0] = "DIFFERENT!";
    const job = (await this.retryJob()) as RescueJob;
    JobBuffer.add(`Retried job ${String(job.arguments[0])}`);
    return job;
  }),
);

RescueJob.rescueFrom(
  DeserializationError,
  block(function (this: RescueJob, e: Error) {
    JobBuffer.add("rescued from DeserializationError");
    JobBuffer.add(
      `DeserializationError original exception was ${rbModName(rbObjClass(e.cause as object))}`,
    );
  }),
);

RescueJob.rescueFrom(
  NotImplementedError,
  block(function (this: RescueJob) {
    JobBuffer.add("rescued from NotImplementedError");
  }),
);
