/**
 * Thin registry that decouples base.ts from the encryption namespace.
 *
 * base.ts imports these no-op stubs so the barrel doesn't drag
 * zlib/crypto into browser bundles. encryption.ts registers the real
 * implementations at module-load time, which only happens when a
 * consumer explicitly imports the encryption namespace.
 *
 * @internal
 */

export interface EncryptionHooks {
  encrypts(klass: any, ...args: any[]): void;

  applyPendingEncryptions(klass: any): void;

  /**
   * Re-check the ignoreCase `original_<name>` missing-column requirement against
   * the authoritative column set reflected from the real adapter schema. Called
   * from schema reflection so a genuinely absent column raises Configuration
   * even when `encrypts(ignoreCase)` was declared before the adapter connected
   * (fail-closed, matching Rails). Optional: only registered once the encryption
   * namespace is loaded; base.ts callers no-op through the stub otherwise.
   */
  requireOriginalColumnsAfterReflection?(klass: any, columnNames: string[]): void;

  /**
   * Build a Scheme from `Base.encrypts` options, adapting the legacy
   * `{ encrypt, decrypt }` shim and supplying a defaultEncryptor fallback.
   * Optional: only registered once the encryption namespace is loaded; callers
   * fall back to `schemeFor` when it's absent.
   */
  buildScheme?(options: any): any;

  encryptedAttributeQ(klass: any, name: string): boolean;

  ciphertextFor(record: any, name: string): unknown;

  encryptRecord(record: any): Promise<void>;

  decryptRecord(record: any): Promise<void>;
}

function notLoaded(method: string): never {
  throw new Error(
    `ActiveRecord encryption is not loaded. ` +
      `Import \`@blazetrails/activerecord/encryption\` before calling \`${method}\`.`,
  );
}

export const encryptionHooks: EncryptionHooks = {
  encrypts: (klass: any) => notLoaded(`${klass?.name ?? "Model"}.encrypts()`),
  applyPendingEncryptions: () => {},
  encryptedAttributeQ: () => false,
  ciphertextFor: () => undefined,
  encryptRecord: async () => {},
  decryptRecord: async () => {},
};

/** @internal */
export function registerEncryptionHooks(hooks: EncryptionHooks): void {
  Object.assign(encryptionHooks, hooks);
}
