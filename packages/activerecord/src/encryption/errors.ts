export class Base extends Error {
  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class Encoding extends Base {
  constructor(message?: string) {
    super(message ?? "Encryption encoding error");
  }
}

export class Decryption extends Base {
  constructor(message?: string) {
    super(message ?? "Failed to decrypt");
  }
}

export class Encryption extends Base {
  constructor(message?: string) {
    super(message ?? "Failed to encrypt");
  }
}

export class Configuration extends Base {
  constructor(message?: string) {
    super(message ?? "Encryption configuration error");
  }
}

export class ForbiddenClass extends Base {
  constructor(message?: string) {
    super(message ?? "Forbidden class");
  }
}

export class EncryptedContentIntegrity extends Base {
  constructor(message?: string) {
    super(message ?? "Encrypted content integrity violated");
  }
}
