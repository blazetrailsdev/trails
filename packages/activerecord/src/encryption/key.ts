import { Digest } from "@blazetrails/ruby-compat";
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
    return Digest.SHA1.hexdigest(this.secret).slice(0, 4);
  }

  static deriveFrom(password: string): Key {
    const secret = (Configurable.keyGenerator as KeyGenerator).deriveKeyFrom(password);
    return new Key(secret);
  }
}
