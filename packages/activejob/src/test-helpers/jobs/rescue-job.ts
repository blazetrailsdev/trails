import {
  ArgumentError,
  NotImplementedError,
  registerConstant,
  rbObjAsString,
  block as rbBlock,
  rbObjClass,
  rbModName,
  StandardError,
} from "@blazetrails/ruby-compat";
import { DeserializationError } from "../../arguments.js";
import { Base } from "../../base.js";
import { add } from "../../test-helpers/support/job-buffer.js";

export class RescueJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform(person: any = "david"): any {
    if (person === "david") {
      throw new ArgumentError("Hair too good");
    } else if (person === "other") {
      throw new OtherError("Bad hair");
    } else if (person === "rafael") {
      throw new NotImplementedError("Hair is just perfect");
    } else {
      return add("performed beautifully");
    }
  }
}
registerConstant("RescueJob", RescueJob);
{
  RescueJob.rescueFrom(
    ArgumentError,
    rbBlock(async function (this: any) {
      add("rescued from ArgumentError");
      this.arguments[0] = "DIFFERENT!";
      const job: any = await this.retryJob();
      add(`Retried job ${rbObjAsString(job.arguments[0])}`);
      return job;
    }),
  );
  RescueJob.rescueFrom(
    DeserializationError,
    rbBlock(function (this: any, e?: any) {
      add("rescued from DeserializationError");
      return add(
        `DeserializationError original exception was ${rbObjAsString(rbModName(rbObjClass(e.cause)))}`,
      );
    }),
  );
  RescueJob.rescueFrom(
    NotImplementedError,
    rbBlock(function (this: any) {
      return add("rescued from NotImplementedError");
    }),
  );
}
export class OtherError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("RescueJob::OtherError", OtherError);
