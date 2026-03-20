/**
 * Encryption-specific error classes.
 *
 * Mirrors: ActiveRecord::Encryption::Errors
 */

export class EncryptionError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "EncryptionError";
  }
}

export class DecryptionError extends EncryptionError {
  constructor(message?: string) {
    super(message ?? "Failed to decrypt");
    this.name = "DecryptionError";
  }
}

export class EncryptedContentIntegrity extends EncryptionError {
  constructor(message?: string) {
    super(message ?? "Encrypted content integrity violated");
    this.name = "EncryptedContentIntegrity";
  }
}

export class ForbiddenClass extends EncryptionError {
  constructor(message?: string) {
    super(message ?? "Forbidden class");
    this.name = "ForbiddenClass";
  }
}

export class ConfigError extends EncryptionError {
  constructor(message?: string) {
    super(message ?? "Encryption configuration error");
    this.name = "ConfigError";
  }
}
