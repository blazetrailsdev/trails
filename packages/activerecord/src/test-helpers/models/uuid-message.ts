import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { UuidEntry } from "./uuid-entry.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class UuidMessage extends Base {
  static {
    this.hasOne("uuidEntry", { as: "entryable" });
  }
}
constSet(TopLevel, "UuidMessage", UuidMessage);
DescendantsTracker.registerSubclass(Base, UuidMessage);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface UuidMessage {
  get uuidEntry(): UuidEntry | null | Promise<UuidEntry | null>;
  set uuidEntry(value: UuidEntry | null);
}
