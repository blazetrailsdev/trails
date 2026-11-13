import { ArgumentError, TopLevel } from "@blazetrails/ruby-compat";
import type { Timezone } from "../timezone.js";
import { TimezoneInfo } from "./timezone-info.js";

export class LinkedTimezoneInfo extends TimezoneInfo {
  readonly linkToIdentifier: string;

  constructor(identifier: string, linkToIdentifier: string) {
    super(identifier);
    if (linkToIdentifier == null) throw new ArgumentError("link_to_identifier must be specified");
    this.linkToIdentifier = linkToIdentifier;
  }

  override createTimezone(): Timezone {
    const { LinkedTimezone } = TopLevel.TZInfo! as unknown as {
      LinkedTimezone: new (info: LinkedTimezoneInfo) => Timezone;
    };
    return new LinkedTimezone(this);
  }
}
