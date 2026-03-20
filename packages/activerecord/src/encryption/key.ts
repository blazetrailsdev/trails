/**
 * Encryption key — wraps a secret with optional public tags.
 *
 * Mirrors: ActiveRecord::Encryption::Key
 */

import { KeyGenerator } from "./key-generator.js";

export class Key {
  secret: string;
  publicTags: Record<string, unknown>;

  constructor(secret: string) {
    this.secret = secret;
    this.publicTags = {};
  }

  get id(): string {
    return this.secret.slice(0, 4);
  }

  static deriveFrom(password: string): Key {
    const generator = new KeyGenerator();
    const secret = generator.deriveKey(password);
    return new Key(secret);
  }
}
