import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { ClassMethods as Broadcasts } from "../../../../lib/app/models/concerns/turbo/broadcastable.js";
import { ApplicationRecord } from "./application-record.js";

export class Board extends ApplicationRecord {
  declare name: string | null;

  static {
    (this as unknown as typeof Broadcasts).broadcastsRefreshes.call(this as never);
  }
}
constSet(TopLevel, "Board", Board);
