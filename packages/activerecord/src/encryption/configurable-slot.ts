/**
 * Late-bound `Configurable` slot, a module with ZERO runtime imports so it
 * cannot participate in any import cycle. `configurable.ts` fills it on load
 * (self-registration at the bottom of that file), and the five files Rails has
 * read `ActiveRecord::Encryption.config` / `.cipher` / `.key_provider` /
 * `.message_serializer` import the binding from here under its Rails name, so
 * their call sites read exactly as the Ruby does.
 *
 * Ruby resolves those constants when the method runs — `encryptor.rb:27,98,108,132`,
 * `context.rb:38`, `scheme.rb:49,98,103`, `key_provider.rb:22`,
 * `key_generator.rb:11,45` — so naming them costs those files no load order.
 * ESM has no such deferral: `configurable.ts` reads `Contexts.context` and
 * `Config` (`configurable.rb:9,17,33,36`), which reach `Encryptor` and
 * `KeyProvider` again, so an eager `import` of `configurable.js` from any of
 * the five puts `EncryptingOnlyEncryptor extends Encryptor`
 * (`encrypting_only_encryptor.rb:6`) and
 * `DerivedSecretKeyProvider extends KeyProvider`
 * (`derived_secret_key_provider.rb:6`) inside a cycle: entered at
 * `encryptor.ts` or `key-provider.ts`, the subclass evaluates with its
 * superclass still in TDZ.
 *
 * The shape itself — and why the alternatives do not work — is written down
 * once in CLAUDE.md, "Call-time constant resolution (Ruby autoload → the
 * zero-import slot)". This file is one of its two instances; do not re-derive
 * the justification here or add a third instance without reading that section.
 *
 * @internal
 */

import type { Configurable as ConfigurableClass } from "./configurable.js";

/**
 * Typed as always present because every reader runs long after
 * `configurable.ts` has been loaded — the module the whole cluster's public API
 * funnels through.
 *
 * @internal
 */

export let Configurable = undefined as unknown as typeof ConfigurableClass;

/** @internal */

export function _setConfigurable(configurable: typeof ConfigurableClass): void {
  Configurable = configurable;
}
