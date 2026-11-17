import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationRecord } from "./application-record.js";

export class Board extends ApplicationRecord {
  declare name: string | null;
}
constSet(TopLevel, "Board", Board);
