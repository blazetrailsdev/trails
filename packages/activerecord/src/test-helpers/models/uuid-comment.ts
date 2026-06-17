import type { UuidEntry } from "./uuid-entry.js";
// vendor/rails/activerecord/test/models/uuid_comment.rb
import { Base } from "../../base.js";

export class UuidComment extends Base {
  declare uuidEntry: UuidEntry | null;
  declare loadHasOne: (name: "uuidEntry") => Promise<UuidEntry | null>;

  static {
    this.hasOne("uuidEntry", { as: "entryable" });
  }
}
