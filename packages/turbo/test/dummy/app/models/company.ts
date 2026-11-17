import { Model } from "@blazetrails/activemodel";
import { constSet, rbModAttrReader, rbModAttrWriter, TopLevel } from "@blazetrails/ruby-compat";

export class Company extends Model {
  declare id: unknown;
  declare name: unknown;

  static {
    rbModAttrReader(this, "id", "name");
    rbModAttrWriter(this, "id", "name");
  }

  toPartialPath(): string {
    return "companies/company";
  }
}
constSet(TopLevel, "Company", Company);
