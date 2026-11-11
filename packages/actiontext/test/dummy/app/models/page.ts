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
export class Page extends ApplicationRecord {
  static {
    include(this, Attachable);
  }

  declare title: string | null;
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include ActionText::Attachable`.
export interface Page extends AttachableMethods {}
constSet(TopLevel, "Page", Page);
