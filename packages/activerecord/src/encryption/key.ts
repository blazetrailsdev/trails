import { getCrypto } from "@blazetrails/activesupport";
import { Configurable } from "./configurable-slot.js";
import type { KeyGenerator } from "./key-generator.js";
import { Properties } from "./properties.js";

export class Key {
  secret: string;
  publicTags: Properties;

  constructor(secret: string) {
    this.secret = secret;
    this.publicTags = new Properties();
  }

  /** @missingRailsCall first — PERMANENT */
  get id(): string {
    return getCrypto().createHash("sha1").update(this.secret).digest("hex").slice(0, 4);
  }

  static deriveFrom(password: string): Key {
    const secret = (Configurable.keyGenerator as KeyGenerator).deriveKeyFrom(password);
    return new Key(secret);
  }
}
