import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";

export const Admin = { tableNamePrefix: "admin_" };
constSet(TopLevel, "Admin", Admin);
