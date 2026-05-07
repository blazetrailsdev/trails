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

  ciphertextFor(instance: any, name: string): unknown;

  encryptRecord(instance: any): Promise<void>;

  decryptRecord(instance: any): Promise<void>;
}

const noop = (): void => {};

export const encryptionHooks: EncryptionHooks = {
  encrypts: noop,
  applyPendingEncryptions: noop,
  encryptedAttributeQ: () => false,
  ciphertextFor: () => undefined,
  encryptRecord: async () => {},
  decryptRecord: async () => {},
};

/** @internal */
export function registerEncryptionHooks(hooks: EncryptionHooks): void {
  Object.assign(encryptionHooks, hooks);
}
