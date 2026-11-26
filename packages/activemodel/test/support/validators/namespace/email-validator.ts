import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { constGet } from "@blazetrails/ruby-compat/variable";
import { EmailValidator as BaseEmailValidator } from "../email-validator.js";

export class EmailValidator extends BaseEmailValidator {}

constSet(TopLevel, "Namespace", {});
constSet(constGet(Object, "Namespace") as object, "EmailValidator", EmailValidator);
