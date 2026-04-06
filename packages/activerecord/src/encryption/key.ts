/**
 * Encryption key — wraps a secret with optional public tags.
 *
 * Mirrors: ActiveRecord::Encryption::Key
 */

import { getCrypto } from "@blazetrails/activesupport";
import { KeyGenerator } from "./key-generator.js";

export class Key {
  secret: string;
  publicTags: Record<string, unknown>;

  constructor(secret: string) {
    this.secret = secret;
    this.publicTags = {};
  }

  get id(): string {
    return getCrypto().createHash("sha256").update(this.secret).digest("hex").slice(0, 8);
  }

  static deriveFrom(password: string): Key {
    const generator = new KeyGenerator();
    const secret = generator.deriveKey(password);
    return new Key(secret);
  }
}
