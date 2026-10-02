import { StandardError } from "@blazetrails/ruby-compat";
import * as Errors from "./errors.js";
import { Encryption as ActiveRecordEncryption } from "../namespaces.js";
export class Base extends StandardError {}

export class Encoding extends Base {}

export class Decryption extends Base {}

export class Encryption extends Base {}

export class Configuration extends Base {}

export class ForbiddenClass extends Base {}

export class EncryptedContentIntegrity extends Base {}

ActiveRecordEncryption.Errors = Errors;
