/**
 * ActiveRecord::Encryption — declares encrypted attributes.
 *
 * When an attribute is declared with `encrypts()`, reads will
 * decrypt and writes will encrypt transparently.
 *
 * By default uses a simple base64 encoding. Supply a custom
 * `encryptor` for real encryption (AES, etc.).
 *
 * Mirrors: ActiveRecord::Encryption
 */

export interface Encryptor {
  encrypt(value: string): string;
  decrypt(ciphertext: string): string;
}

/**
 * Default encryptor — base64 round-trip.
 * NOT secure — intended as a placeholder.
 * Users should supply a real Encryptor.
 */
export const defaultEncryptor: Encryptor = {
  encrypt(value: string): string {
    return Buffer.from(value, "utf-8").toString("base64");
  },
  decrypt(ciphertext: string): string {
    return Buffer.from(ciphertext, "base64").toString("utf-8");
  },
};

/**
 * Registry of encrypted attribute names per model class,
 * keyed by a class identifier.
 */
const encryptedAttributes = new WeakMap<object, Map<string, Encryptor>>();

/**
 * Declare one or more attributes as encrypted on a model class.
 *
 * Usage (inside a static block on a Base subclass):
 *   encrypts("ssn", "email");
 *   encrypts("secret", { encryptor: myEncryptor });
 */
export function encrypts(klass: any, ...args: Array<string | { encryptor?: Encryptor }>): void {
  let enc: Encryptor = defaultEncryptor;
  const names: string[] = [];

  for (const arg of args) {
    if (typeof arg === "string") {
      names.push(arg);
    } else if (arg && typeof arg === "object" && arg.encryptor) {
      enc = arg.encryptor;
    }
  }

  if (!encryptedAttributes.has(klass)) {
    encryptedAttributes.set(klass, new Map());
  }
  const map = encryptedAttributes.get(klass)!;
  for (const name of names) {
    map.set(name, enc);
  }
}

/**
 * Get the encryptor for a given attribute on a class, if encrypted.
 */
export function getEncryptor(klass: any, attr: string): Encryptor | undefined {
  // Walk prototype chain
  let current = klass;
  while (current) {
    const map = encryptedAttributes.get(current);
    if (map?.has(attr)) {
      return map.get(attr);
    }
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

/**
 * Check if an attribute is encrypted on a class.
 */
export function isEncryptedAttribute(klass: any, attr: string): boolean {
  return getEncryptor(klass, attr) !== undefined;
}
