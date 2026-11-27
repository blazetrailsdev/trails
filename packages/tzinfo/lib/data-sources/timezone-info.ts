import { ArgumentError } from "@blazetrails/ruby-compat/argument-error";
import { NotImplementedError } from "@blazetrails/ruby-compat/not-implemented-error";
import { rbModName } from "@blazetrails/ruby-compat/object";
import type { Timezone } from "../timezone.js";

export class TimezoneInfo {
  readonly identifier: string;

  constructor(identifier: string) {
    if (identifier == null) throw new ArgumentError("identifier must be specified");
    this.identifier = identifier;
  }

  inspect(): string {
    return `#<${rbModName(this.constructor)}: ${this.identifier}>`;
  }

  createTimezone(): Timezone {
    this.raiseNotImplemented("create_timezone");
  }

  /** @internal */
  protected raiseNotImplemented(methodName: string): never {
    throw new NotImplementedError(`Subclasses must override ${methodName}`);
  }
}
