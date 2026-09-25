import { Autoload, extend, runLoadHooks } from "@blazetrails/activesupport";
import { ActiveRecord, Encryption } from "./namespaces.js";
import { type SchemeOptions } from "./encryption/scheme.js";
import { Cipher } from "./encryption/cipher.js";
import { Configurable } from "./encryption/configurable.js";
import { Contexts } from "./encryption/contexts.js";
export { Cipher };

export type EncryptsOptions = SchemeOptions;

extend(Encryption, Configurable);
extend(Encryption, Contexts);

Object.defineProperty(Encryption, "eagerLoadBang", {
  value: async function eagerLoadBang(this: typeof Encryption): Promise<void> {
    await Autoload.eagerLoadBang.call(this);

    await Cipher.eagerLoadBang();
  },
  writable: true,
  configurable: true,
});

ActiveRecord.Encryption = Encryption;

runLoadHooks("active_record_encryption", Encryption);

export { Encryption };
