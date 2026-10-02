import { first } from "@blazetrails/activesupport";
import { Digest } from "@blazetrails/ruby-compat";
import { Encryption } from "../namespaces.js";
import type { KeyGenerator } from "./key-generator.js";
import { Properties } from "./properties.js";

export class Key {
  secret: string;
  publicTags: Properties;

  constructor(secret: string) {
    this.secret = secret;
    this.publicTags = new Properties();
  }

  get id(): string {
    return first(Digest.SHA1.hexdigest(this.secret), 4);
  }

  static deriveFrom(password: string): Key {
    const secret = (Encryption.keyGenerator as KeyGenerator).deriveKeyFrom(password);
    return new Key(secret);
  }
}

Encryption.Key = Key;
