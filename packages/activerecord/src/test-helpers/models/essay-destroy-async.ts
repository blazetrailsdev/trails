import type { BookDestroyAsync } from "./book-destroy-async.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class EssayDestroyAsync extends Base {
  static _tableName = "essays";

  static {
    this.belongsTo("book", { dependent: "destroy", className: "BookDestroyAsync" });
    this.belongsTo("writer", { polymorphic: true, dependent: "destroy" });
  }
}
registerModel(EssayDestroyAsync);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface EssayDestroyAsync {
  get book(): BookDestroyAsync | null | Promise<BookDestroyAsync | null>;
  set book(value: BookDestroyAsync | null);
  get writer(): Base | null | Promise<Base | null>;
  set writer(value: Base | null);
}

export class LongEssayDestroyAsync extends EssayDestroyAsync {}
registerModel(LongEssayDestroyAsync);

export class ShortEssayDestroyAsync extends EssayDestroyAsync {}
registerModel(ShortEssayDestroyAsync);
