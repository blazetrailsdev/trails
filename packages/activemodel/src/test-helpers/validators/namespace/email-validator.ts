import { registerConstant } from "@blazetrails/ruby-compat";
import { EmailValidator as BaseEmailValidator } from "../email-validator.js";

export class EmailValidator extends BaseEmailValidator {}

registerConstant("Namespace::EmailValidator", EmailValidator);
