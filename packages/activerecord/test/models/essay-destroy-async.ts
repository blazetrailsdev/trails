import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import "../../lib/destroy-association-async-job.js";
import type { BookDestroyAsync } from "./book-destroy-async.js";
import { Base } from "../../lib/base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class EssayDestroyAsync extends Base {
  static tableName = "essays";

  static {
    this.belongsTo("book", { dependent: "destroyAsync", className: "BookDestroyAsync" });
    this.belongsTo("writer", { polymorphic: true, dependent: "destroyAsync" });
  }
}
constSet(TopLevel, "EssayDestroyAsync", EssayDestroyAsync);
DescendantsTracker.registerSubclass(Base, EssayDestroyAsync);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface EssayDestroyAsync {
  get book(): BookDestroyAsync | null | Promise<BookDestroyAsync | null>;
  set book(value: BookDestroyAsync | null);
  get writer(): Base | null | Promise<Base | null>;
  set writer(value: Base | null);
}

export class LongEssayDestroyAsync extends EssayDestroyAsync {}
constSet(TopLevel, "LongEssayDestroyAsync", LongEssayDestroyAsync);
DescendantsTracker.registerSubclass(EssayDestroyAsync, LongEssayDestroyAsync);

export class ShortEssayDestroyAsync extends EssayDestroyAsync {}
constSet(TopLevel, "ShortEssayDestroyAsync", ShortEssayDestroyAsync);
DescendantsTracker.registerSubclass(EssayDestroyAsync, ShortEssayDestroyAsync);
