/**
 * Encryption-specific error classes.
 *
 * Mirrors: ActiveRecord::Encryption::Errors
 */

export class Base extends Error {
  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** @deprecated Use Base instead */
export class EncryptionError extends Base {
  constructor(message?: string) {
    super(message);
    this.name = "EncryptionError";
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

/** @deprecated Use Decryption instead */
export class DecryptionError extends Decryption {
  constructor(message?: string) {
    super(message);
    this.name = "DecryptionError";
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

/** @deprecated Use Configuration instead */
export class ConfigError extends Configuration {
  constructor(message?: string) {
    super(message);
    this.name = "ConfigError";
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
