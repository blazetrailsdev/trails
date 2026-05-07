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
