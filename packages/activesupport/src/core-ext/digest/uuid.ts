import { ArgumentError } from "../../hash-utils.js";
import { getCrypto } from "../../crypto-adapter.js";

/**
 * Digest::UUID — mirrors `active_support/core_ext/digest/uuid.rb`.
 *
 * Ruby's namespace constants are 16 raw bytes packed into a String; a JS string
 * cannot hold arbitrary bytes, so they are `Uint8Array` here and
 * `packUuidNamespace` returns bytes rather than a packed String.
 */

function namespaceBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g)!, (byte) => parseInt(byte, 16));
}

/** @internal */
export const DNS_NAMESPACE = namespaceBytes("6ba7b8109dad11d180b400c04fd430c8");
/** @internal */
export const URL_NAMESPACE = namespaceBytes("6ba7b8119dad11d180b400c04fd430c8");
/** @internal */
export const OID_NAMESPACE = namespaceBytes("6ba7b8129dad11d180b400c04fd430c8");
/** @internal */
export const X500_NAMESPACE = namespaceBytes("6ba7b8149dad11d180b400c04fd430c8");

/**
 * Generates a v5 non-random UUID (Universally Unique IDentifier).
 *
 * Passing `"md5"` generates version 3 UUIDs; `"sha1"` generates version 5
 * UUIDs. `uuidFromHash` always generates the same UUID for a given name and
 * namespace combination.
 *
 * Mirrors: Digest::UUID.uuid_from_hash (`core_ext/digest/uuid.rb:19-38`).
 * Rails switches on the digest *class*; trails' crypto adapter names its
 * digests with the OpenSSL string, so `hashClass` is that string.
 */
export function uuidFromHash(
  hashClass: string,
  namespace: string | Uint8Array,
  name: string,
): string {
  let version: number;
  if (hashClass === "md5") {
    version = 3;
  } else if (hashClass === "sha1") {
    version = 5;
  } else {
    throw new ArgumentError(
      `Expected OpenSSL::Digest::SHA1 or OpenSSL::Digest::MD5, got ${hashClass}.`,
    );
  }

  const uuidNamespace = packUuidNamespace(namespace);

  const hash = getCrypto().createHash(hashClass);
  hash.update(uuidNamespace);
  hash.update(name);

  const digest = hash.digest();
  const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const ary = [
    view.getUint32(0),
    view.getUint16(4),
    view.getUint16(6),
    view.getUint16(8),
    view.getUint16(10),
    view.getUint32(12),
  ];
  ary[2] = (ary[2] & 0x0fff) | (version << 12);
  ary[3] = (ary[3] & 0x3fff) | 0x8000;

  const hex = (value: number, width: number) => value.toString(16).padStart(width, "0");
  return `${hex(ary[0], 8)}-${hex(ary[1], 4)}-${hex(ary[2], 4)}-${hex(ary[3], 4)}-${hex(ary[4], 4)}${hex(ary[5], 8)}`;
}

/**
 * Convenience method for uuidFromHash using MD5.
 *
 * Mirrors: Digest::UUID.uuid_v3 (`core_ext/digest/uuid.rb:41-43`).
 */
export function uuidV3(uuidNamespace: string | Uint8Array, name: string): string {
  return uuidFromHash("md5", uuidNamespace, name);
}

/**
 * Convenience method for uuidFromHash using SHA1.
 *
 * Mirrors: Digest::UUID.uuid_v5 (`core_ext/digest/uuid.rb:46-48`).
 */
export function uuidV5(uuidNamespace: string | Uint8Array, name: string): string {
  return uuidFromHash("sha1", uuidNamespace, name);
}

/**
 * Convenience method for SecureRandom.uuid.
 *
 * Mirrors: Digest::UUID.uuid_v4 (`core_ext/digest/uuid.rb:51-53`).
 */
export function uuidV4(): string {
  return getCrypto().randomUUID();
}

/**
 * Returns the nil UUID. This is a special form of UUID that is specified to
 * have all 128 bits set to zero.
 *
 * Mirrors: Digest::UUID.nil_uuid (`core_ext/digest/uuid.rb:57-59`).
 */
export function nilUuid(): string {
  return "00000000-0000-0000-0000-000000000000";
}

/**
 * @internal Mirrors: Digest::UUID.pack_uuid_namespace
 * (`core_ext/digest/uuid.rb:61-71`, `private_class_method`).
 */
export function packUuidNamespace(namespace: string | Uint8Array): Uint8Array {
  if (
    ([DNS_NAMESPACE, OID_NAMESPACE, URL_NAMESPACE, X500_NAMESPACE] as unknown[]).includes(namespace)
  ) {
    return namespace as Uint8Array;
  } else {
    const matchData =
      typeof namespace === "string"
        ? namespace.match(
            /^([0-9a-fA-F]{8})-([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-([0-9a-fA-F]{4})([0-9a-fA-F]{8})$/,
          )
        : null;

    if (matchData == null) throw new ArgumentError("Only UUIDs are valid namespace identifiers");

    return namespaceBytes(matchData.slice(1).join(""));
  }
}
