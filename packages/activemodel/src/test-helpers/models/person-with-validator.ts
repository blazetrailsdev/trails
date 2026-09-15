import { isBlank } from "@blazetrails/activesupport";
import { Model } from "../../index.js";
import { EachValidator } from "../../validator.js";
import type { ValidatableRecord } from "../../validator.js";

class PresenceValidator extends EachValidator {
  validateEach(record: ValidatableRecord, attribute: string, value: unknown): void {
    if (isBlank(value)) {
      record.errors.add(attribute, undefined, {
        message: `Local validator${(this.options.custom as string | undefined) ?? ""}`,
      });
    }
  }
}

class LikeValidator extends EachValidator {
  declare with: string;

  constructor(options: Record<string, unknown>) {
    super(options);
    this.with = options.with as string;
  }

  validateEach(record: ValidatableRecord, attribute: string, value: unknown): void {
    if (!(value as string).includes(this.with)) {
      record.errors.add(attribute, `does not appear to be like ${this.with}`);
    }
  }
}

export class PersonWithValidator extends Model {
  static PresenceValidator = PresenceValidator;
  static LikeValidator = LikeValidator;

  declare private _title: string | null | undefined;
  declare private _karma: string | null | undefined;

  get title(): string | null {
    return this._title ?? null;
  }

  set title(value: string | null) {
    this._title = value;
  }

  get karma(): string | null {
    return this._karma ?? null;
  }

  set karma(value: string | null) {
    this._karma = value;
  }
}
