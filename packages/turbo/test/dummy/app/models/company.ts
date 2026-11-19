import { Model } from "@blazetrails/activemodel";
import { rbModAttrReader, rbModAttrWriter, TopLevel } from "@blazetrails/ruby-compat";

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    Company?: typeof Company;
  }
}

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
TopLevel.Company = Company;
