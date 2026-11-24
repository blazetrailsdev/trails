import { constSet, constDefined } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { constGet } from "@blazetrails/ruby-compat/variable";

export const UsersHelpeR = {};
if (!constDefined(Object, "Admin")) constSet(TopLevel, "Admin", {});
constSet(constGet(Object, "Admin") as object, "UsersHelpeR", UsersHelpeR);
