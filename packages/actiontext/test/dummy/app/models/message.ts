import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Review } from "./review.js";
import { ApplicationRecord } from "./application-record.js";

export class Message extends ApplicationRecord {
  declare subject: string | null;
  declare review: Review | null | Promise<Review | null>;

  static {
    this.hasOne("review");
    this.acceptsNestedAttributesFor("review");
  }
}
constSet(TopLevel, "Message", Message);
