import {
  constGet,
  constSet, TopLevel, isRegisteredConstant } from "@blazetrails/ruby-compat";

export const UsersHelpeR = {};
if (!isRegisteredConstant("Admin")) constSet(TopLevel, "Admin", {});
constSet(constGet(Object, "Admin") as object, "UsersHelpeR", UsersHelpeR);
