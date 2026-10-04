import { Module, registerConstant } from "@blazetrails/ruby-compat";

export const Admin = new Module();
registerConstant("Admin", Admin);

export const Cpk = new Module();
registerConstant("Cpk", Cpk);

export const Namespaced = new Module();
registerConstant("Namespaced", Namespaced);

export const Publisher = new Module();
registerConstant("Publisher", Publisher);

export const Web = new Module();
registerConstant("Web", Web);
