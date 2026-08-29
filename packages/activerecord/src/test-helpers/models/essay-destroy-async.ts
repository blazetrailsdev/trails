import type { BookDestroyAsync } from "./book-destroy-async.js";
import { Base } from "../../base.js";

export class EssayDestroyAsync extends Base {
  declare book: BookDestroyAsync | null;
  declare writer: Base | null;
  declare loadBelongsTo: ((name: "book") => Promise<BookDestroyAsync | null>) &
    ((name: "writer") => Promise<Base | null>);

  static _tableName = "essays";

  static {
    this.belongsTo("book", { dependent: "destroy", className: "BookDestroyAsync" });
    this.belongsTo("writer", { polymorphic: true, dependent: "destroy" });
  }
}

export class LongEssayDestroyAsync extends EssayDestroyAsync {}

export class ShortEssayDestroyAsync extends EssayDestroyAsync {}
