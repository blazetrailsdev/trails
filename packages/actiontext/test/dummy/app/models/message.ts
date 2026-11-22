import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { RichText } from "../../../../lib/rich-text.js";
import type { Review } from "./review.js";
import { ApplicationRecord } from "./application-record.js";

export class Message extends ApplicationRecord {
  declare subject: string | null;
  declare content: RichText | null;
  declare body: RichText | null;
  declare richTextContent: RichText | null | Promise<RichText | null>;
  declare review: Review | null | Promise<Review | null>;

  static {
    this.hasRichText("content");
    this.hasRichText("body");

    this.hasOne("review");
    this.acceptsNestedAttributesFor("review");
  }
}
constSet(TopLevel, "Message", Message);
