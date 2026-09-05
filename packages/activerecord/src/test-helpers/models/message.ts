import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import type { Entry } from "./entry.js";
import type { Recipient } from "./recipient.js";
import { Base } from "../../base.js";

export class Message extends Base {
  declare entry: Entry | null;
  declare recipients: AssociationProxy<Recipient>;
  declare loadHasOne: (name: "entry") => Promise<Entry | null>;
  declare subject: string;
  declare updated_at: RubyTime | Temporal.PlainDateTime;

  static {
    this.hasOne("entry", { as: "entryable", touch: true });
    this.hasMany("recipients");
  }
}
