import type { EncryptsOptions } from "@blazetrails/activerecord/encryption";
import { included } from "@blazetrails/activesupport";
import { classModule } from "@blazetrails/ruby-compat";
import { SolidCache } from "../solid-cache.js";

export class Encryption {
  static readonly [classModule] = true;

  static [included](base: { encrypts(...args: Array<string | EncryptsOptions>): void }): void {
    if (SolidCache.configuration.isEncrypt()) {
      base.encrypts("value", SolidCache.configuration.encryptionContextProperties!);
    }
  }
}
