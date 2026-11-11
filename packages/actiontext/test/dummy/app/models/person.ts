import { include } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Attachable } from "../../../../lib/attachable.js";

type AttachableMethods = Pick<
  typeof Attachable,
  | "attachableSgid"
  | "attachableContentType"
  | "attachableFilename"
  | "attachableFilesize"
  | "attachableMetadata"
  | "isPreviewableAttachable"
  | "toTrixContentAttachmentPartialPath"
  | "toAttachablePartialPath"
  | "toRichTextAttributes"
>;
import { ApplicationRecord } from "./application-record.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below.
export class Person extends ApplicationRecord {
  static {
    include(this, Attachable);
  }

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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include ActionText::Attachable`.
export interface Person extends AttachableMethods {}
constSet(TopLevel, "Person", Person);
