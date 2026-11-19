import { TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationRecord } from "./application-record.js";

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    Board?: typeof Board;
  }
}

export class Board extends ApplicationRecord {
  declare name: string | null;

  static {
    this.broadcastsRefreshes();
  }
}
TopLevel.Board = Board;
