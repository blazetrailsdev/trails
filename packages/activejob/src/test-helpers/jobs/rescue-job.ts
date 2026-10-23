import {
  ArgumentError,
  NotImplementedError,
  registerConstant,
  block as rbBlock,
  StandardError,
} from "@blazetrails/ruby-compat";
import { DeserializationError } from "../../arguments.js";
import { Base } from "../../base.js";
import { JobBuffer } from "../../test-helpers/support/job-buffer.js";

export class RescueJob extends Base {
  static toString(): string {
    return "RescueJob";
  }

  perform(person: unknown = "david") {
    if (person === "david") {
      throw new ArgumentError("Hair too good");
    } else if (person === "other") {
      throw new OtherError("Bad hair");
    } else if (person === "rafael") {
      throw new NotImplementedError("Hair is just perfect");
    } else {
      return JobBuffer.add("performed beautifully");
    }
  }
}
registerConstant("RescueJob", RescueJob);
{
  RescueJob.rescueFrom(
    ArgumentError,
    rbBlock(async function () {
      JobBuffer.add("rescued from ArgumentError");
      this.arguments[0] = "DIFFERENT!";
      const job = await this.retryJob();
      JobBuffer.add(`Retried job ${job.arguments[0] ?? ""}`);
      return job;
    }),
  );
  RescueJob.rescueFrom(
    DeserializationError,
    rbBlock(function (e) {
      JobBuffer.add("rescued from DeserializationError");
      return JobBuffer.add(
        `DeserializationError original exception was ${(Object.hasOwn(e.cause.constructor, "toString") ? String(e.cause.constructor) : e.cause.constructor.name || null) ?? ""}`,
      );
    }),
  );
  RescueJob.rescueFrom(
    NotImplementedError,
    rbBlock(function () {
      return JobBuffer.add("rescued from NotImplementedError");
    }),
  );
}
export class OtherError extends StandardError {
  static toString(): string {
    return "RescueJob::OtherError";
  }
}
registerConstant("RescueJob::OtherError", OtherError);
