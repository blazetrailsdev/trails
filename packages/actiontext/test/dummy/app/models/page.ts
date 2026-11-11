import { include, type Included } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Attachable } from "../../../../lib/attachable.js";
import { ApplicationRecord } from "./application-record.js";

export class Page extends ApplicationRecord {
  static {
    include(this, Attachable);
  }

  declare attachableSgid: Included<typeof Attachable>["attachableSgid"];
  declare toRichTextAttributes: Included<typeof Attachable>["toRichTextAttributes"];
  declare toTrixContentAttachmentPartialPath: Included<
    typeof Attachable
  >["toTrixContentAttachmentPartialPath"];

  declare title: string | null;
}
constSet(TopLevel, "Page", Page);
