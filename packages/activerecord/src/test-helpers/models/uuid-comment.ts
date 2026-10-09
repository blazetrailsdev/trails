import { registerConstant } from "@blazetrails/ruby-compat";
import type { UuidEntry } from "./uuid-entry.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class UuidComment extends Base {
  static {
    this.hasOne("uuidEntry", { as: "entryable" });
  }
}
registerConstant("UuidComment", UuidComment);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface UuidComment {
  get uuidEntry(): UuidEntry | null | Promise<UuidEntry | null>;
  set uuidEntry(value: UuidEntry | null);
}
