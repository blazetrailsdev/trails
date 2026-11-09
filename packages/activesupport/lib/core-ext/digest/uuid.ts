import { ArgumentError } from "../../hash-utils.js";
import { Digest, OpenSSL, SecureRandom, type DigestClass } from "@blazetrails/ruby-compat";

function namespaceBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g)!, (byte) => parseInt(byte, 16));
}

function sameBytes(known: Uint8Array, namespace: string | Uint8Array): boolean {
  if (typeof namespace === "string") return false;
  return known.length === namespace.length && known.every((byte, i) => byte === namespace[i]);
}

/** @internal */
export const DNS_NAMESPACE = namespaceBytes("6ba7b8109dad11d180b400c04fd430c8");
/** @internal */
export const URL_NAMESPACE = namespaceBytes("6ba7b8119dad11d180b400c04fd430c8");
/** @internal */
export const OID_NAMESPACE = namespaceBytes("6ba7b8129dad11d180b400c04fd430c8");
/** @internal */
export const X500_NAMESPACE = namespaceBytes("6ba7b8149dad11d180b400c04fd430c8");

export function uuidFromHash(
  hashClass: DigestClass,
  namespace: string | Uint8Array,
  name: string,
): string {
  let version: number;
  if (hashClass === Digest.MD5 || hashClass === OpenSSL.Digest.MD5) {
    version = 3;
  } else if (hashClass === Digest.SHA1 || hashClass === OpenSSL.Digest.SHA1) {
    version = 5;
  } else {
    throw new ArgumentError(
      `Expected OpenSSL::Digest::SHA1 or OpenSSL::Digest::MD5, got ${hashClass.name}.`,
    );
  }

  const uuidNamespace = packUuidNamespace(namespace);

  const hash = hashClass.new();
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

export function uuidV3(uuidNamespace: string | Uint8Array, name: string): string {
  return uuidFromHash(OpenSSL.Digest.MD5, uuidNamespace, name);
}

export function uuidV5(uuidNamespace: string | Uint8Array, name: string): string {
  return uuidFromHash(OpenSSL.Digest.SHA1, uuidNamespace, name);
}

export function uuidV4(): string {
  return SecureRandom.uuid();
}

export function nilUuid(): string {
  return "00000000-0000-0000-0000-000000000000";
}

export function packUuidNamespace(namespace: string | Uint8Array): Uint8Array {
  if (
    [DNS_NAMESPACE, OID_NAMESPACE, URL_NAMESPACE, X500_NAMESPACE].some((known) =>
      sameBytes(known, namespace),
    )
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
