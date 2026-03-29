/**
 * Encrypted fixtures — support for encrypted attributes in fixtures.
 *
 * Mirrors: ActiveRecord::Encryption::EncryptedFixtures
 */

export interface EncryptedFixtures {
  encryptFixtureData(
    data: Record<string, unknown>,
    encryptedAttributes: string[],
    encrypt: (value: unknown) => unknown,
  ): Record<string, unknown>;
}

export function encryptFixtureData(
  data: Record<string, unknown>,
  encryptedAttributes: string[],
  encrypt: (value: unknown) => unknown,
): Record<string, unknown> {
  const result = { ...data };
  for (const attr of encryptedAttributes) {
    if (attr in result) {
      result[attr] = encrypt(result[attr]);
    }
  }
  return result;
}
