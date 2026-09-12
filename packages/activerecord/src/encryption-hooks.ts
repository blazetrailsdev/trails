/** @internal */

export interface EncryptionHooks {
  encrypts(klass: any, ...args: any[]): void;

  requireOriginalColumnsAfterReflection?(klass: any, columnNames: string[]): void;

  encryptedAttribute(record: any, name: string): boolean;

  ciphertextFor(record: any, name: string): unknown;

  encrypt(record: any): Promise<void>;

  decrypt(record: any): Promise<void>;
}

function notLoaded(method: string): never {
  throw new Error(
    `ActiveRecord encryption is not loaded. ` +
      `Import \`@blazetrails/activerecord/encryption\` before calling \`${method}\`.`,
  );
}

/** @noRailsEquivalent CONVERGEABLE converge-receipted-activerecord-root-and-adapter-names */
export const encryptionHooks: EncryptionHooks = {
  encrypts: (klass: any) => notLoaded(`${klass?.name ?? "Model"}.encrypts()`),
  encryptedAttribute: () => false,
  ciphertextFor: () => undefined,
  encrypt: async () => {},
  decrypt: async () => {},
};

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function registerEncryptionHooks(hooks: EncryptionHooks): void {
  Object.assign(encryptionHooks, hooks);
}
