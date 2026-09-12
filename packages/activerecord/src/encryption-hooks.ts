/** @internal */

export interface EncryptionHooks {
  /** @noRailsEquivalent PERMANENT */
  encrypts(klass: any, ...args: any[]): void;

  requireOriginalColumnsAfterReflection?(klass: any, columnNames: string[]): void;

  /** @noRailsEquivalent PERMANENT */
  encryptedAttribute(record: any, name: string): boolean;

  /** @noRailsEquivalent PERMANENT */
  ciphertextFor(record: any, name: string): unknown;

  /** @noRailsEquivalent PERMANENT */
  encrypt(record: any): Promise<void>;

  /** @noRailsEquivalent PERMANENT */
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
