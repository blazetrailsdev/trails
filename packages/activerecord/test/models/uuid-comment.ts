import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import type { UuidEntry } from "./uuid-entry.js";
import { Base } from "../../lib/base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class UuidComment extends Base {
  static {
    this.hasOne("uuidEntry", { as: "entryable" });
  }
}
constSet(TopLevel, "UuidComment", UuidComment);
DescendantsTracker.registerSubclass(Base, UuidComment);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface UuidComment {
  get uuidEntry(): UuidEntry | null | Promise<UuidEntry | null>;
  set uuidEntry(value: UuidEntry | null);
}
