import {
  constGet,
  constSet, TopLevel, constDefined } from "@blazetrails/ruby-compat";

export const UsersHelpeR = {};
if (!constDefined(Object, "Admin")) constSet(TopLevel, "Admin", {});
constSet(constGet(Object, "Admin") as object, "UsersHelpeR", UsersHelpeR);
