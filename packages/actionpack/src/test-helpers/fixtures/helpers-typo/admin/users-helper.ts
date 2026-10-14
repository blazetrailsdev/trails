import { Module, registerConstant } from "@blazetrails/ruby-compat";

export const UsersHelpeR = new Module().include({});
registerConstant("Admin::UsersHelpeR", UsersHelpeR);
