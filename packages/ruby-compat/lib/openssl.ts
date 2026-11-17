import { getCrypto, type CipherAdapter, type DecipherAdapter } from "./crypto-adapter.js";
import { getFs, type Bytes } from "./fs-adapter.js";
import { DigestClass, type DigestInstance } from "./digest.js";
import { SecureRandom } from "./secure-random.js";
import { ArgumentError } from "./argument-error.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { NoMethodError } from "./no-method-error.js";
import { StandardError } from "./standard-error.js";
import { IPAddr } from "./ipaddr.js";
import { stringSplit } from "./string/split.js";
import type { HttpSslOptions } from "./http-adapter.js";

const AEAD_MODES = ["gcm", "ccm", "ocb", "chacha20-poly1305", "siv"];

/**
 * `OpenSSL::Cipher::CipherError` (`vendor/ruby/v3.3.11/ext/openssl/ossl_cipher.c:1047`).
 *
 * @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_cipher.c:1047
 */
export class CipherError extends StandardError {}

const SSL_VERIFY_CODES = [
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_REVOKED",
  "CERT_UNTRUSTED",
  "CERT_REJECTED",
  "CERT_SIGNATURE_FAILURE",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "HOSTNAME_MISMATCH",
];

/**
 * `OpenSSL::SSL::SSLError` (`vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:2616`). A
 * TLS failure reaches JS as the host's own error with an `ERR_SSL_` or
 * `ERR_TLS_` code, or an OpenSSL certificate-verify code, which is this class to `rescue OpenSSL::SSL::SSLError`.
 *
 * @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:2616
 */
class SSLError extends StandardError {
  static [Symbol.hasInstance](error: unknown): boolean {
    const code = (error as { code?: unknown } | null | undefined)?.code;
    return (
      Function.prototype[Symbol.hasInstance].call(this, error) ||
      (typeof code === "string" &&
        (code.startsWith("ERR_SSL_") ||
          code.startsWith("ERR_TLS_") ||
          SSL_VERIFY_CODES.includes(code)))
    );
  }
}

/** `OP_ALL` (`vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:3004`). */
const OP_ALL = 0x80000850;
/** `OP_DONT_INSERT_EMPTY_FRAGMENTS` (`vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:3026`). */
const OP_DONT_INSERT_EMPTY_FRAGMENTS = 0x800;
/** `OP_NO_COMPRESSION` (`vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:3029`). */
const OP_NO_COMPRESSION = 0x20000;

/**
 * `OpenSSL::X509` verify-result constants (`DefX509Const`,
 * `vendor/ruby/v3.3.11/ext/openssl/ossl_x509.c:50-71`), keyed by the code a
 * TLS failure carries.
 */
const X509_VERIFY_RESULTS = {
  V_OK: 0,
  V_ERR_UNABLE_TO_GET_ISSUER_CERT: 2,
  V_ERR_CERT_SIGNATURE_FAILURE: 7,
  V_ERR_CERT_NOT_YET_VALID: 9,
  V_ERR_CERT_HAS_EXPIRED: 10,
  V_ERR_DEPTH_ZERO_SELF_SIGNED_CERT: 18,
  V_ERR_SELF_SIGNED_CERT_IN_CHAIN: 19,
  V_ERR_UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 20,
  V_ERR_UNABLE_TO_VERIFY_LEAF_SIGNATURE: 21,
  V_ERR_CERT_REVOKED: 23,
  V_ERR_CERT_UNTRUSTED: 27,
  V_ERR_CERT_REJECTED: 28,
  V_ERR_HOSTNAME_MISMATCH: 62,
} as const;

/**
 * `OpenSSL::X509::Store` (`vendor/ruby/v3.3.11/ext/openssl/ossl_x509store.c:920`).
 * It holds PEM text, which a TLS handshake is handed as its trust anchors.
 *
 * @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_x509store.c:920
 */
export class Store {
  /** @internal */
  _certs: string[] = [];
  /** @internal */
  _defaultPaths = false;

  /** @noRailsEquivalent PERMANENT */
  async addFile(file: string): Promise<this> {
    this._certs.push(new TextDecoder().decode(await getFs().readFile(file)));
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  addCert(cert: string): this {
    this._certs.push(cert);
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  setDefaultPaths(): null {
    this._defaultPaths = true;
    return null;
  }
}

/**
 * `OpenSSL::SSL::SSLContext` (`vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:2633`,
 * `lib/openssl/ssl.rb:22`).
 *
 * @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/lib/openssl/ssl.rb:22
 */
export class SSLContext {
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:2910` */
  static readonly SESSION_CACHE_CLIENT = 0x0001;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:2915` */
  static readonly SESSION_CACHE_SERVER = 0x0002;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:2941` */
  static readonly SESSION_CACHE_NO_INTERNAL_STORE = 0x0300;
  /** @noRailsEquivalent PERMANENT */
  static DEFAULT_PARAMS: Record<string, unknown> = {
    minVersion: 0x301,
    verifyMode: 1,
    verifyHostname: true,
    options: ((OP_ALL & ~OP_DONT_INSERT_EMPTY_FRAGMENTS) | OP_NO_COMPRESSION) >>> 0,
  };

  /** @noRailsEquivalent PERMANENT */
  static DEFAULT_CERT_STORE: Store = (() => {
    const store = new Store();
    store.setDefaultPaths();
    return store;
  })();

  /** @noRailsEquivalent PERMANENT */
  options = 0;
  /** @noRailsEquivalent PERMANENT */
  verifyMode: number | null;
  /** @noRailsEquivalent PERMANENT */
  verifyHostname: boolean;
  /** @noRailsEquivalent PERMANENT */
  certStore: Store | null = null;
  /** @noRailsEquivalent PERMANENT */
  caFile: string | null = null;
  /** @noRailsEquivalent PERMANENT */
  caPath: string | null = null;
  /** @noRailsEquivalent PERMANENT */
  timeout: number | null = null;
  /** @noRailsEquivalent PERMANENT */
  minVersion: string | number | null = null;
  /** @noRailsEquivalent PERMANENT */
  maxVersion: string | number | null = null;
  /** @noRailsEquivalent PERMANENT */
  cert: unknown = null;
  /** @noRailsEquivalent PERMANENT */
  key: unknown = null;
  /** @noRailsEquivalent PERMANENT */
  ciphers: string | null = null;
  /** @noRailsEquivalent PERMANENT */
  extraChainCert: unknown = null;
  /** @noRailsEquivalent PERMANENT */
  verifyCallback: unknown = null;
  /** @noRailsEquivalent PERMANENT */
  verifyDepth: number | null = null;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:2722` */
  sessionNewCb: ((sock: SSLSocket, sess: Session) => unknown) | null = null;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:2898` */
  sessionCacheMode: number = SSLContext.SESSION_CACHE_SERVER;

  /**
   * `ssl_timeout=`, the alias of `timeout=` (`vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:2880`).
   *
   * @noRailsEquivalent PERMANENT
   */
  set sslTimeout(timeout: number | null) {
    this.timeout = timeout;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/openssl/lib/openssl/ssl.rb:208-221` */
  set sslVersion(meth: string) {
    meth = meth.replace(/(_client|_server)$/, "");
    const version = (METHODS_MAP as Record<string, number>)[meth];
    if (version === undefined) throw new ArgumentError(`unknown SSL method \`${meth}'`);
    this.minVersion = this.maxVersion = version;
  }

  constructor() {
    this.options = (this.options | OpenSSL.SSL.OP_ALL) >>> 0;
    this.verifyMode = OpenSSL.SSL.VERIFY_NONE;
    this.verifyHostname = false;
  }

  /** @noRailsEquivalent PERMANENT */
  setParams(params: Record<string, unknown> = {}): Record<string, unknown> {
    params = { ...SSLContext.DEFAULT_PARAMS, ...params };
    this.options = params.options as number;
    delete params.options;
    for (const [name, value] of Object.entries(params)) {
      if (!(name in this)) {
        throw new NoMethodError(
          `undefined method '${name}=' for an instance of OpenSSL::SSL::SSLContext`,
        );
      }
      (this as unknown as Record<string, unknown>)[name] = value;
    }
    if (this.verifyMode !== OpenSSL.SSL.VERIFY_NONE) {
      if (!(this.caFile != null || this.caPath != null || this.certStore != null)) {
        this.certStore = SSLContext.DEFAULT_CERT_STORE;
      }
    }
    return params;
  }

  /**
   * `ossl_sslctx_setup` (`vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:691-830`) and
   * `set_minmax_proto_version` (`:162-185`): the trust anchors and protocol
   * bounds this context hands the host's handshake.
   *
   * @internal @noRailsEquivalent PERMANENT
   */
  async _setup(): Promise<{
    ca: string[] | null;
    defaultPaths: boolean;
    minVersion?: TlsVersion;
    maxVersion?: TlsVersion;
  }> {
    const certs: string[] = [];
    if (this.caFile != null) {
      certs.push(new TextDecoder().decode(await getFs().readFile(this.caFile)));
    }
    if (this.certStore != null) certs.push(...this.certStore._certs);
    const ca = certs.length > 0 ? certs : null;
    const defaultPaths = this.certStore?._defaultPaths ?? false;
    const min = _hostProtoVersion(this.minVersion);
    const max = _hostProtoVersion(this.maxVersion);
    return { ca, defaultPaths, ...(min && { minVersion: min }), ...(max && { maxVersion: max }) };
  }
}

/** `METHODS_MAP` (`vendor/ruby/v3.3.11/ext/openssl/lib/openssl/ssl.rb:223-230`). */
const METHODS_MAP = { SSLv23: 0, SSLv3: 0x300, TLSv1: 0x301, TLSv1_1: 0x302, TLSv1_2: 0x303 };

/** `parse_proto_version`'s map (`vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:123-153`). */
const PROTO_VERSIONS: Record<string, number> = {
  SSL3: 0x300,
  TLS1: 0x301,
  TLS1_1: 0x302,
  TLS1_2: 0x303,
  TLS1_3: 0x304,
};

type TlsVersion = "TLSv1" | "TLSv1.1" | "TLSv1.2" | "TLSv1.3";

function _hostProtoVersion(version: string | number | null): TlsVersion | undefined {
  if (version == null) return undefined;
  const v = typeof version === "number" ? version : PROTO_VERSIONS[version];
  if (v === undefined) throw new ArgumentError(`unrecognized version "${version}"`);
  return v >= 0x301 ? (`TLSv1${v === 0x301 ? "" : `.${v - 0x301}`}` as TlsVersion) : undefined;
}

/** @noRailsEquivalent PERMANENT */
export interface SSLSocketIO {
  close(): void;
  startSsl(options: HttpSslOptions): Promise<void>;
  peeraddr?(): [string, number, string, string];
  readonly cipher?: string[] | null;
}

const TLS1_DEFAULT_TIMEOUT = 7200;

/**
 * `OpenSSL::SSL::Session` (`vendor/ruby/v3.3.11/ext/openssl/ossl_ssl_session.c:301-330`):
 * the host's serialized session, with the time it was established and its
 * lifetime in seconds. The host reports neither, so `time` is the moment the
 * host handed the session over and `timeout` is `TLS1_DEFAULT_TIMEOUT`, OpenSSL's
 * `tls1_default_timeout` (`ssl/t1_lib.c`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Session {
  constructor(
    /** @internal */
    readonly _der: Uint8Array,
    /** @noRailsEquivalent PERMANENT */
    readonly time: Date = new Date(),
    /** @noRailsEquivalent PERMANENT */
    readonly timeout: number = TLS1_DEFAULT_TIMEOUT,
  ) {}
}

/**
 * `OpenSSL::SSL.verify_certificate_identity` (`vendor/ruby/v3.3.11/ext/openssl/lib/openssl/ssl.rb:275-306`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function verifyCertificateIdentity(cert: Certificate, hostname: string): boolean {
  let shouldVerifyCommonName = true;
  for (const ext of cert.extensions) {
    if (ext.oid !== "subjectAltName") continue;
    const sequence = _derSeq(_derRead(ext._value, 0).value);
    for (const san of sequence) {
      switch (san.tag & 0x1f) {
        case 2:
          shouldVerifyCommonName = false;
          if (verifyHostname(hostname, new TextDecoder().decode(san.value))) return true;
          break;
        case 7:
          shouldVerifyCommonName = false;
          if (san.value.length === 4 || san.value.length === 16) {
            try {
              if (_bytesEqual(san.value, new IPAddr(hostname).hton())) return true;
            } catch (e) {
              if (!(e instanceof IPAddr.InvalidAddressError)) throw e;
            }
          }
          break;
      }
    }
  }
  if (shouldVerifyCommonName) {
    for (const [oid, value] of cert.subject._entries) {
      if (oid === "CN") {
        if (verifyHostname(hostname, value)) return true;
      }
    }
  }
  return false;
}

/**
 * `OpenSSL::SSL.verify_hostname` (`vendor/ruby/v3.3.11/ext/openssl/lib/openssl/ssl.rb:308-338`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function verifyHostname(hostname: string, san: string): boolean {
  if (!_isAsciiOnly(san)) return false;
  if (!_isAsciiOnly(hostname)) return false;

  const sanParts = stringSplit(san.toLowerCase(), ".");

  if (sanParts.length < 2) return san === hostname;

  const hostParts = stringSplit(hostname.toLowerCase(), ".");

  if (sanParts.length !== hostParts.length) return false;

  if (!verifyWildcard(hostParts.shift()!, sanParts.shift()!)) return false;

  return sanParts.join(".") === hostParts.join(".");
}

/**
 * `OpenSSL::SSL.verify_wildcard` (`vendor/ruby/v3.3.11/ext/openssl/lib/openssl/ssl.rb:341-357`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function verifyWildcard(domainComponent: string, sanComponent: string): boolean {
  const parts = sanComponent.split("*");

  if (parts.length > 2) return false;
  if (parts.length === 1) return sanComponent === domainComponent;

  if (domainComponent.startsWith("xn--") && sanComponent !== "*") return false;

  return (
    parts[0].length + parts[1].length < domainComponent.length &&
    domainComponent.startsWith(parts[0]) &&
    domainComponent.endsWith(parts[1])
  );
}

function _isAsciiOnly(str: string): boolean {
  return [...str].every((c) => c.charCodeAt(0) < 0x80);
}

function _bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

function _derRead(der: Uint8Array, at: number): { tag: number; value: Uint8Array; end: number } {
  let length = der[at + 1];
  let start = at + 2;
  if (length & 0x80) {
    const n = length & 0x7f;
    length = 0;
    for (let i = 0; i < n; i++) length = length * 256 + der[start + i];
    start += n;
  }
  return { tag: der[at], value: der.subarray(start, start + length), end: start + length };
}

function _derSeq(contents: Uint8Array): { tag: number; value: Uint8Array }[] {
  const children: { tag: number; value: Uint8Array }[] = [];
  for (let at = 0; at < contents.length; ) {
    const child = _derRead(contents, at);
    children.push(child);
    at = child.end;
  }
  return children;
}

function _derToOid(value: Uint8Array): string {
  const arcs = [Math.floor(value[0] / 40), value[0] % 40];
  let arc = 0;
  for (const byte of value.subarray(1)) {
    arc = arc * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) {
      arcs.push(arc);
      arc = 0;
    }
  }
  const oid = arcs.join(".");
  return Object.keys(OIDS).find((name) => OIDS[name] === oid) ?? oid;
}

/**
 * `OpenSSL::SSL::SSLSocket` (`vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:2963`,
 * `lib/openssl/ssl.rb:359`). The handshake is the host's, run over `io`.
 *
 * @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/lib/openssl/ssl.rb:359
 */
export class SSLSocket<IO extends SSLSocketIO = SSLSocketIO> {
  /** @noRailsEquivalent PERMANENT */
  hostname: string | null = null;
  /** @noRailsEquivalent PERMANENT */
  syncClose = false;
  /** @internal */
  _verifyResult: number = X509_VERIFY_RESULTS.V_OK;
  /** @internal */
  _closed = false;
  /** @internal */
  _session: Session | null = null;
  /** @internal */
  _peerCert: Certificate | null = null;

  constructor(
    /** @noRailsEquivalent PERMANENT */
    readonly io: IO,
    /** @noRailsEquivalent PERMANENT */
    readonly context: SSLContext,
  ) {}

  /** @noRailsEquivalent PERMANENT */
  get verifyResult(): number {
    return this._verifyResult;
  }

  /** @internal */
  _setVerifyResult(code: unknown): void {
    if (code === "ERR_TLS_CERT_ALTNAME_INVALID") code = "HOSTNAME_MISMATCH";
    const result =
      typeof code === "string"
        ? (X509_VERIFY_RESULTS as Record<string, number>)[`V_ERR_${code}`]
        : undefined;
    if (result !== undefined) this._verifyResult = result;
  }

  /**
   * `ossl_ssl_connect` (`vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:1847-1855`):
   * `ossl_ssl_setup` and `ossl_start_ssl` over the host's handshake.
   *
   * @noRailsEquivalent PERMANENT
   */
  async connect(): Promise<this> {
    const { ca, defaultPaths, minVersion, maxVersion } = await this.context._setup();
    try {
      await this.io.startSsl({
        sslHostAddress: this.hostname,
        verifyPeer: this.context.verifyMode !== OpenSSL.SSL.VERIFY_NONE,
        verifyHostname: this.context.verifyHostname,
        options: this.context.options,
        session: this._session?._der ?? null,
        sessionNewCb: (der) => {
          if (this.context.sessionNewCb !== null) this.context.sessionNewCb(this, new Session(der));
        },
        peerCertCb: (der) => {
          this._peerCert = der === null ? null : new Certificate(der);
        },
        ca,
        defaultPaths,
        ...(minVersion !== undefined && { minVersion }),
        ...(maxVersion !== undefined && { maxVersion }),
      });
    } catch (e) {
      this._setVerifyResult((e as { code?: unknown } | null)?.code);
      throw _osslStartSslError(e, this.io);
    }
    return this;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:2336-2348` */
  set session(sess: Session) {
    this._session = sess;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:2977` */
  get peerCert(): Certificate | null {
    return this._peerCert;
  }

  /** @noRailsEquivalent PERMANENT */
  get cipher(): string[] | null {
    return this.io.cipher ?? null;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/openssl/lib/openssl/ssl.rb:396-410` */
  postConnectionCheck(hostname: string): true {
    if (this.peerCert === null) {
      let msg = "Peer verification enabled, but no certificate received.";
      if (this.isUsingAnonCipher()) {
        msg +=
          ` Anonymous cipher suite ${this.cipher![0]} was negotiated. ` +
          "Anonymous suites must be disabled to use peer verification.";
      }
      throw new SSLError(msg);
    }

    if (!verifyCertificateIdentity(this.peerCert, hostname)) {
      throw new SSLError(`hostname "${hostname}" does not match the server certificate`);
    }
    return true;
  }

  /**
   * `using_anon_cipher?` (`vendor/ruby/v3.3.11/ext/openssl/lib/openssl/ssl.rb:425-429`):
   * the `aNULL` cipher list, OpenSSL's `ADH-` and `AECDH-` suites.
   *
   * @noRailsEquivalent PERMANENT
   */
  isUsingAnonCipher(): boolean {
    const name = this.cipher?.[0];
    return name != null && /^A(EC)?DH-/.test(name);
  }

  /** @noRailsEquivalent PERMANENT */
  close(): void {
    if (this._closed) return;
    this._closed = true;
    if (this.syncClose) this.io.close();
  }

  /** @noRailsEquivalent PERMANENT */
  isClosed(): boolean {
    return this._closed;
  }
}

/**
 * `ossl_start_ssl`'s raise (`vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:1797-1821`):
 * the host's TLS failure as the `OpenSSL::SSL::SSLError` Ruby raises. A
 * certificate-verify failure carries the host's verify code (the
 * `SSL_VERIFY_CODES` `SSLError` matches) and `X509_verify_cert_error_string`'s
 * text as its message, and is appended as `: certificate verify failed (...)`;
 * any other failure appends OpenSSL's `ERR_reason_error_string`, the host
 * error's `reason`, as `ossl_make_error` does (`ext/openssl/ossl.c:272-297`).
 */
function _osslStartSslError(e: unknown, io: SSLSocketIO): unknown {
  if (!(e instanceof SSLError)) return e;
  if (Function.prototype[Symbol.hasInstance].call(SSLError, e)) return e;
  const host = e as unknown as Error & { code: string; reason?: string };
  const errorAppend = SSL_VERIFY_CODES.includes(host.code)
    ? `: certificate verify failed (${host.message.replace(/; if the root CA .*$/s, "")})`
    : `: ${host.reason ?? host.message}`;
  let peeraddr = "(null)";
  try {
    const addrinfo = io.peeraddr?.();
    if (addrinfo !== undefined) peeraddr = `${addrinfo[2]}:${addrinfo[1]}`;
  } catch {
    peeraddr = "(null)";
  }
  return new SSLError(
    `SSL_connect returned=1 errno=0 peeraddr=${peeraddr} state=error${errorAppend}`,
  );
}

/**
 * `OpenSSL::Cipher` (`vendor/ruby/v3.3.11/ext/openssl/lib/openssl/cipher.rb:16`), the
 * sliver Rails drives (`message_encryptor.rb:276-290`).
 *
 * @noRailsEquivalent PERMANENT — Ruby's openssl extension
 * (`vendor/ruby/v3.3.11/ext/openssl/lib/openssl/cipher.rb:16`), which Rails calls
 * without defining.
 */
export class Cipher {
  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_cipher.c:1047 */
  static readonly CipherError = CipherError;

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_cipher.c:355 */
  readonly name: string;

  private mode: "encrypt" | "decrypt" | null = null;
  private currentKey: Uint8Array | null = null;
  private currentIv: Uint8Array | null = null;
  private impl: CipherAdapter | DecipherAdapter | null = null;

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_cipher.c:139 */
  constructor(name: string) {
    this.name = name;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_cipher.c:824 */
  get keyLen(): number {
    return this.cipherInfo().keyLength;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_cipher.c:868 */
  get ivLen(): number {
    return this.cipherInfo().ivLength;
  }

  /**
   * `OpenSSL::Cipher#authenticated?` (`vendor/ruby/v3.3.11/ext/openssl/ossl_cipher.c:547`),
   * `EVP_CIPH_FLAG_AEAD_CIPHER` on the cipher — the AEAD modes the adapter
   * names.
   *
   * @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_cipher.c:547
   */
  authenticated(): boolean {
    return AEAD_MODES.includes(this.cipherInfo().mode);
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_cipher.c:283 */
  encrypt(): this {
    this.mode = "encrypt";
    return this;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_cipher.c:302 */
  decrypt(): this {
    this.mode = "decrypt";
    return this;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_cipher.c:840 */
  set key(key: Uint8Array) {
    const keyLen = this.keyLen;
    if (key.length !== keyLen) throw new ArgumentError(`key must be ${keyLen} bytes`);
    this.currentKey = key;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_cipher.c:884 */
  set iv(iv: Uint8Array) {
    const ivLen = this.ivLen;
    if (iv.length !== ivLen) throw new ArgumentError(`iv must be ${ivLen} bytes`);
    this.currentIv = iv;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/lib/openssl/cipher.rb:56 */
  randomIv(): Bytes {
    const str = SecureRandom.randomBytes(this.ivLen);
    this.currentIv = str;
    return str;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_cipher.c:920 */
  set authTag(tag: Uint8Array) {
    const impl = this.started();
    if (!impl.setAuthTag) {
      throw new Error("Crypto adapter does not support GCM auth tags (setAuthTag)");
    }
    try {
      impl.setAuthTag(tag);
    } catch (e) {
      if (e instanceof TypeError) throw e;
      throw new CipherError("unable to set AEAD tag");
    }
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_cipher.c:898 */
  get authTag(): Bytes {
    const impl = this.started() as CipherAdapter;
    if (!impl.getAuthTag) {
      throw new Error("Crypto adapter does not support GCM auth tags (getAuthTag)");
    }
    return impl.getAuthTag();
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_cipher.c:958 */
  set authData(data: Uint8Array | string) {
    const impl = this.started();
    if (!impl.setAAD) {
      throw new Error("Crypto adapter does not support AEAD auth data (setAAD)");
    }
    impl.setAAD(typeof data === "string" ? new TextEncoder().encode(data) : data);
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_cipher.c:504 */
  update(data: Uint8Array): Bytes {
    try {
      return (this.started() as CipherAdapter).update(data);
    } catch (e) {
      if (e instanceof TypeError) throw e;
      throw new CipherError((e as Error).message);
    }
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_cipher.c:568 */
  final(): Bytes {
    try {
      return (this.started() as CipherAdapter).final();
    } catch (e) {
      if (e instanceof TypeError) throw e;
      throw new CipherError((e as Error).message);
    }
  }

  private cipherInfo(): { keyLength: number; ivLength: number; mode: string } {
    const crypto = getCrypto();
    const info = crypto.getCipherInfo?.(this.name);
    if (!info) {
      throw new Error(`Crypto adapter does not know cipher "${this.name}" (getCipherInfo)`);
    }
    return info;
  }

  private started(): CipherAdapter | DecipherAdapter {
    if (this.impl) return this.impl;
    if (!this.mode) throw new Error("Cipher mode not set: call encrypt() or decrypt() first");
    if (!this.currentKey) throw new Error("Cipher key not set");
    if (!this.currentIv) throw new Error("Cipher iv not set");
    const crypto = getCrypto();
    this.impl =
      this.mode === "encrypt"
        ? crypto.createCipheriv(this.name, this.currentKey, this.currentIv)
        : crypto.createDecipheriv(this.name, this.currentKey, this.currentIv);
    return this.impl;
  }
}

function digestName(digest: string | DigestInstance): string {
  return typeof digest === "string" ? digest : digest.algorithm;
}

/**
 * `OpenSSL::HMAC` (`vendor/ruby/v3.3.11/ext/openssl/lib/openssl/hmac.rb:4`), the two
 * class methods Rails calls (`request_forgery_protection.rb:466`,
 * `message_verifier.rb:353`).
 *
 * @noRailsEquivalent PERMANENT — Ruby's openssl extension
 * (`vendor/ruby/v3.3.11/ext/openssl/lib/openssl/hmac.rb:4`), which Rails calls without
 * defining.
 */
export const HMAC = {
  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/lib/openssl/hmac.rb:34 */
  digest(
    digest: string | DigestInstance,
    key: string | Uint8Array,
    data: string | Uint8Array,
  ): Bytes {
    return getCrypto().createHmac(digestName(digest), key).update(data).digest();
  },

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/lib/openssl/hmac.rb:56 */
  hexdigest(
    digest: string | DigestInstance,
    key: string | Uint8Array,
    data: string | Uint8Array,
  ): string {
    return getCrypto().createHmac(digestName(digest), key).update(data).digest("hex");
  },
};

/**
 * `OpenSSL::Random` (`vendor/ruby/v3.3.11/ext/openssl/ossl_rand.c:12`), the one
 * module function bcrypt calls (`vendor/bcrypt-ruby/v3.1.20/lib/bcrypt/engine.rb:90`).
 *
 * @noRailsEquivalent PERMANENT — Ruby's openssl extension
 * (`vendor/ruby/v3.3.11/ext/openssl/ossl_rand.c:12`), which no Rails file defines.
 */
export const Random = {
  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_rand.c:105 */
  randomBytes(len: number): Bytes {
    return getCrypto().randomBytes(len);
  },
};

function _derLength(length: number): number[] {
  if (length < 0x80) return [length];
  const bytes: number[] = [];
  for (let n = length; n > 0; n = Math.floor(n / 256)) bytes.unshift(n & 0xff);
  return [0x80 | bytes.length, ...bytes];
}

function _der(tag: number, ...contents: Uint8Array[]): Uint8Array {
  const body = contents.flatMap((c) => [...c]);
  return Uint8Array.from([tag, ..._derLength(body.length), ...body]);
}

function _derInteger(value: number): Uint8Array {
  const bytes: number[] = [];
  for (let n = value; n > 0; n = Math.floor(n / 256)) bytes.unshift(n & 0xff);
  if (bytes.length === 0 || bytes[0] & 0x80) bytes.unshift(0);
  return _der(0x02, Uint8Array.from(bytes));
}

function _derOid(oid: string): Uint8Array {
  const [a, b, ...rest] = oid.split(".").map(Number);
  const bytes = [a * 40 + b];
  for (const arc of rest) {
    const chunk = [arc & 0x7f];
    for (let n = arc >>> 7; n > 0; n >>>= 7) chunk.unshift((n & 0x7f) | 0x80);
    bytes.push(...chunk);
  }
  return _der(0x06, Uint8Array.from(bytes));
}

const _utf8 = (s: string) => new TextEncoder().encode(s);

function _derTime(time: Date): Uint8Array {
  const iso = time.toISOString();
  return _der(0x17, _utf8(iso.slice(2, 19).replace(/[-T:]/g, "") + "Z"));
}

const OIDS: Record<string, string> = {
  CN: "2.5.4.3",
  O: "2.5.4.10",
  OU: "2.5.4.11",
  C: "2.5.4.6",
  basicConstraints: "2.5.29.19",
  keyUsage: "2.5.29.15",
  subjectAltName: "2.5.29.17",
  sha256WithRSAEncryption: "1.2.840.113549.1.1.11",
};

/** `DEFAULT_OBJECT_TYPE` (`vendor/ruby/v3.3.11/ext/openssl/ossl_x509name.c:553`), `V_ASN1_UTF8STRING`. */
const DEFAULT_OBJECT_TYPE = 0x0c;

/** `OBJECT_TYPE_TEMPLATE` (`vendor/ruby/v3.3.11/ext/openssl/ossl_x509name.c:553-567`). */
const OBJECT_TYPE_TEMPLATE: Record<string, number> = {
  C: 0x13,
  countryName: 0x13,
  serialNumber: 0x13,
  dnQualifier: 0x13,
  DC: 0x16,
  domainComponent: 0x16,
  emailAddress: 0x16,
};

const KEY_USAGE_BITS = [
  "digitalSignature",
  "nonRepudiation",
  "keyEncipherment",
  "dataEncipherment",
  "keyAgreement",
  "keyCertSign",
  "cRLSign",
  "encipherOnly",
];

/**
 * `OpenSSL::PKey::RSA` (`vendor/ruby/v3.3.11/ext/openssl/ossl_pkey_rsa.c:86-131`),
 * generated by the host's crypto adapter.
 *
 * @noRailsEquivalent PERMANENT
 */
export class RSA {
  /** @internal */
  _publicKeyDer: Uint8Array;
  /** @internal */
  _privateKeyPem: string | null;

  constructor(size: number) {
    const crypto = getCrypto();
    if (crypto.generateRsaKeyPair === undefined) {
      throw new NotImplementedError("the crypto adapter has no RSA key generation");
    }
    const pair = crypto.generateRsaKeyPair(size);
    this._publicKeyDer = pair.publicKeyDer;
    this._privateKeyPem = pair.privateKeyPem;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/openssl/lib/openssl/pkey.rb:343-345` */
  get publicKey(): RSA {
    const key = Object.create(RSA.prototype) as RSA;
    key._publicKeyDer = this._publicKeyDer;
    key._privateKeyPem = null;
    return key;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/openssl/ossl_pkey_rsa.c:249` */
  toPem(): string {
    return this._privateKeyPem ?? _pem("PUBLIC KEY", this._publicKeyDer);
  }
}

function _pem(label: string, der: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...der));
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

/**
 * `OpenSSL::X509::Name` (`vendor/ruby/v3.3.11/ext/openssl/lib/openssl/x509.rb:265-328`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Name {
  constructor(
    /** @internal */
    readonly _entries: [string, string][] = [],
  ) {}

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/openssl/lib/openssl/x509.rb:305-316` */
  static parse(str: string): Name {
    let ary: [string, string][];
    if (str.startsWith("/")) {
      ary = str
        .slice(1)
        .split("/")
        .map((i) => i.split("=", 2) as [string, string]);
    } else {
      ary = str.split(",").map((i) => i.trim().split("=", 2) as [string, string]);
    }
    return new Name(ary);
  }

  /** @internal */
  _toDer(): Uint8Array {
    return _der(
      0x30,
      ...this._entries.map(([key, value]) => {
        if (OIDS[key] === undefined) throw new ArgumentError(`invalid field name: ${key}`);
        const type = OBJECT_TYPE_TEMPLATE[key] ?? DEFAULT_OBJECT_TYPE;
        return _der(0x31, _der(0x30, _derOid(OIDS[key]), _der(type, _utf8(value))));
      }),
    );
  }
}

/**
 * `OpenSSL::X509::Extension` (`vendor/ruby/v3.3.11/ext/openssl/ossl_x509ext.c:358`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Extension {
  constructor(
    /** @noRailsEquivalent PERMANENT */
    readonly oid: string,
    /** @internal */
    readonly _value: Uint8Array,
    /** @noRailsEquivalent PERMANENT */
    readonly critical: boolean = false,
  ) {}

  /** @internal */
  _toDer(): Uint8Array {
    const critical = this.critical ? [_der(0x01, Uint8Array.of(0xff))] : [];
    return _der(0x30, _derOid(OIDS[this.oid]), ...critical, _der(0x04, this._value));
  }
}

/**
 * `OpenSSL::X509::ExtensionFactory` (`vendor/ruby/v3.3.11/ext/openssl/ossl_x509ext.c:219-329`),
 * for the `basicConstraints`, `keyUsage` and `subjectAltName` config strings.
 *
 * @noRailsEquivalent PERMANENT
 */
export class ExtensionFactory {
  /** @noRailsEquivalent PERMANENT */
  subjectCertificate: Certificate | null = null;
  /** @noRailsEquivalent PERMANENT */
  issuerCertificate: Certificate | null = null;

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/openssl/lib/openssl/x509.rb:17-25` */
  createExtension(oid: string, value: string, critical: boolean = false): Extension {
    const items = value.split(",").map((item) => item.trim());
    let der: Uint8Array;
    switch (oid) {
      case "basicConstraints":
        der = _der(0x30, ...(items.includes("CA:TRUE") ? [_der(0x01, Uint8Array.of(0xff))] : []));
        break;
      case "keyUsage": {
        let bits = 0;
        for (const item of items) bits |= 0x80 >> KEY_USAGE_BITS.indexOf(item);
        let unused = 0;
        while (unused < 7 && !(bits & (1 << unused))) unused++;
        der = _der(0x03, Uint8Array.of(unused, bits));
        break;
      }
      case "subjectAltName":
        der = _der(
          0x30,
          ...items.map((item) => {
            const [type, name] = item.split(":", 2) as [string, string];
            if (type === "IP") return _der(0x87, Uint8Array.from(name.split(".").map(Number)));
            if (type === "DNS") return _der(0x82, _utf8(name));
            throw new ArgumentError(`unsupported subjectAltName type: ${type}`);
          }),
        );
        break;
      default:
        throw new NotImplementedError(`unsupported extension: ${oid}`);
    }
    return new Extension(oid, der, critical);
  }
}

/**
 * `OpenSSL::X509::Certificate` (`vendor/ruby/v3.3.11/ext/openssl/ossl_x509cert.c:815`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Certificate {
  /** @noRailsEquivalent PERMANENT */
  version = 0;
  /** @noRailsEquivalent PERMANENT */
  serial = 0;
  /** @noRailsEquivalent PERMANENT */
  subject: Name = new Name();
  /** @noRailsEquivalent PERMANENT */
  issuer: Name = new Name();
  /** @noRailsEquivalent PERMANENT */
  publicKey: RSA | null = null;
  /** @noRailsEquivalent PERMANENT */
  notBefore: Date | null = null;
  /** @noRailsEquivalent PERMANENT */
  notAfter: Date | null = null;
  /** @noRailsEquivalent PERMANENT */
  extensions: Extension[] = [];
  /** @internal */
  _der: Uint8Array | null = null;

  /**
   * `ossl_x509_initialize` (`vendor/ruby/v3.3.11/ext/openssl/ossl_x509cert.c:110-137`)
   * over a DER string, read for the subject and extensions of its `TBSCertificate`.
   */
  constructor(der: Uint8Array | null = null) {
    if (der === null) return;
    this._der = der;
    const tbs = _derSeq(_derSeq(_derRead(der, 0).value)[0].value);
    const offset = tbs[0].tag === 0xa0 ? 1 : 0;
    this.subject = new Name(
      _derSeq(tbs[offset + 4].value).map((rdn) => {
        const [oid, value] = _derSeq(_derSeq(rdn.value)[0].value);
        return [_derToOid(oid.value), new TextDecoder().decode(value.value)];
      }),
    );
    const extensions = tbs.find((field) => field.tag === 0xa3);
    if (extensions === undefined) return;
    for (const ext of _derSeq(_derRead(extensions.value, 0).value)) {
      const parts = _derSeq(ext.value);
      const critical = parts.length === 3 && parts[1].value[0] !== 0;
      this.extensions.push(new Extension(_derToOid(parts[0].value), parts.at(-1)!.value, critical));
    }
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/openssl/ossl_x509cert.c:681` */
  addExtension(extension: Extension): Extension {
    this.extensions.push(extension);
    return extension;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/openssl/ossl_x509cert.c:523` */
  sign(key: RSA, digest: DigestClass): this {
    if (digest.algorithm !== "sha256") {
      throw new NotImplementedError(`unsupported digest: ${digest.algorithm}`);
    }
    const crypto = getCrypto();
    if (crypto.sign === undefined || key._privateKeyPem === null) {
      throw new NotImplementedError("the crypto adapter has no RSA signing");
    }
    const algorithm = _der(0x30, _derOid(OIDS.sha256WithRSAEncryption), _der(0x05));
    const tbs = _der(
      0x30,
      _der(0xa0, _derInteger(this.version)),
      _derInteger(this.serial),
      algorithm,
      this.issuer._toDer(),
      _der(0x30, _derTime(this.notBefore!), _derTime(this.notAfter!)),
      this.subject._toDer(),
      this.publicKey!._publicKeyDer,
      ...(this.extensions.length > 0
        ? [_der(0xa3, _der(0x30, ...this.extensions.map((e) => e._toDer())))]
        : []),
    );
    const signature = crypto.sign("sha256", tbs, key._privateKeyPem);
    this._der = _der(0x30, tbs, algorithm, _der(0x03, Uint8Array.of(0), signature));
    return this;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/openssl/ossl_x509cert.c:209` */
  toPem(): string {
    return _pem("CERTIFICATE", this._der!);
  }
}

/**
 * `OpenSSL` (`vendor/ruby/v3.3.11/ext/openssl/lib/openssl.rb:16`), so a ported body
 * spells `OpenSSL::HMAC.digest` the way the Ruby does.
 *
 * @noRailsEquivalent PERMANENT — Ruby's openssl extension
 * (`vendor/ruby/v3.3.11/ext/openssl/lib/openssl.rb:16`), which no Rails file defines.
 */
export const OpenSSL = {
  Cipher,
  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_ssl.c:2999-3000 */
  SSL: {
    VERIFY_NONE: 0,
    VERIFY_PEER: 1,
    OP_ALL,
    OP_DONT_INSERT_EMPTY_FRAGMENTS,
    OP_NO_COMPRESSION,
    SSLError,
    /** @internal */
    SSL_VERIFY_CODES,
    SSLContext,
    SSLSocket,
    Session,
    verifyCertificateIdentity,
    verifyHostname,
    verifyWildcard,
  },
  X509: { Store, Name, Certificate, Extension, ExtensionFactory, ...X509_VERIFY_RESULTS },
  PKey: { RSA },
  HMAC,
  Random,
  Digest: {
    /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_digest.c:400 */
    MD5: new DigestClass("md5", "OpenSSL::Digest::MD5"),
    /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_digest.c:400 */
    SHA1: new DigestClass("sha1", "OpenSSL::Digest::SHA1"),
    /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/openssl/ossl_digest.c:400 */
    SHA256: new DigestClass("sha256", "OpenSSL::Digest::SHA256"),
  },
};
