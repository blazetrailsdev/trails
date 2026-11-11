import { include, type Included } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Attachable } from "../../../../lib/attachable.js";
import { ApplicationRecord } from "./application-record.js";

export class Person extends ApplicationRecord {
  static {
    include(this, Attachable);
  }

  declare attachableSgid: Included<typeof Attachable>["attachableSgid"];
  declare toRichTextAttributes: Included<typeof Attachable>["toRichTextAttributes"];

  declare name: string | null;

  static toMissingAttachablePartialPath(): string {
    return "people/missing_attachable";
  }

  toTrixContentAttachmentPartialPath(): string {
    return "people/trix_content_attachment";
  }

  toAttachablePartialPath(): string {
    return "people/attachable";
  }
}
constSet(TopLevel, "Person", Person);
