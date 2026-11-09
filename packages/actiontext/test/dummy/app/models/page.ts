import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationRecord } from "./application-record.js";

export class Page extends ApplicationRecord {
  declare title: string | null;
}
constSet(TopLevel, "Page", Page);
