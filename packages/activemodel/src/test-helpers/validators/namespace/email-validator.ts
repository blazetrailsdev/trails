import { registerConstant } from "@blazetrails/activesupport";
import { EmailValidator as BaseEmailValidator } from "../email-validator.js";

export class EmailValidator extends BaseEmailValidator {}

registerConstant("Namespace::EmailValidator", EmailValidator);
