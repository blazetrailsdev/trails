import { Module, registerConstant } from "@blazetrails/ruby-compat";

export const Admin = Object.assign(new Module(), { tableNamePrefix: "admin_" });
registerConstant("Admin", Admin);
