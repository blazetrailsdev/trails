import { NotImplementedError, rbModName } from "@blazetrails/ruby-compat";
import type { Timezone } from "../timezone.js";

export class TimezoneInfo {
  readonly identifier: string;

  constructor(identifier: string) {
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
