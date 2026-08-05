// Late-bound Configurable slot, extracted into a module with ZERO runtime
// imports so it cannot participate in any import cycle.
//
// Why this exists: Rails resolves `ActiveRecord::Encryption.config`,
// `.key_provider` and `.cipher` when the method runs — encryptor.rb:27,98,108,
// context.rb:38, scheme.rb:49,98,103, key_provider.rb:22, key_generator.rb:11,45
// — so naming them costs those files no load order. ESM has no such deferral:
// `configurable.ts` reads `Contexts.context` and `Config` (configurable.rb:9,17,
// 33,36), which reach `Encryptor` and `KeyProvider` again, so an eager `import`
// of `configurable.js` from any of those five files puts
// `EncryptingOnlyEncryptor extends Encryptor` and
// `DerivedSecretKeyProvider extends KeyProvider` inside a cycle: entered at
// `encryptor.ts` or `key-provider.ts`, the subclass evaluates with its
// superclass still in TDZ.
//
// `configurable.ts` sets this on load (self-registration at the bottom of the
// file); the five readers alias it back to the Rails constant name at the call
// site, which is what Ruby's constant lookup does there.

import type { Configurable } from "./configurable.js";

/** @internal */

export let _Configurable: typeof Configurable | undefined;

/** @internal */

export function _setConfigurable(configurable: typeof Configurable): void {
  _Configurable = configurable;
}
