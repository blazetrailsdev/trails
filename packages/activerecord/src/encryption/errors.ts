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

for (const [id, klass] of Object.entries({
  Base,
  Encoding,
  Decryption,
  Encryption,
  Configuration,
  ForbiddenClass,
  EncryptedContentIntegrity,
})) {
  klass.prototype.name = `ActiveRecord::Encryption::Errors::${id}`;
}

ActiveRecordEncryption.Errors = Errors;
