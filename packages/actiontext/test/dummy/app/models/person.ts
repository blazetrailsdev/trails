import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationRecord } from "./application-record.js";

export class Person extends ApplicationRecord {
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
