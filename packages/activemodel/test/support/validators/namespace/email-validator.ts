import { constGet, constSet, TopLevel } from "@blazetrails/ruby-compat";
import { EmailValidator as BaseEmailValidator } from "../email-validator.js";

export class EmailValidator extends BaseEmailValidator {}

constSet(TopLevel, "Namespace", {});
constSet(constGet(Object, "Namespace") as object, "EmailValidator", EmailValidator);
