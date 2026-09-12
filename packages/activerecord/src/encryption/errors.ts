export class Base extends Error {
  /** @noRailsEquivalent PERMANENT */
  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class Encoding extends Base {}

export class Decryption extends Base {}

export class Encryption extends Base {}

export class Configuration extends Base {}

export class ForbiddenClass extends Base {}

export class EncryptedContentIntegrity extends Base {}
