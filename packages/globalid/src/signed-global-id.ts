import { currentTimeInstant } from "@blazetrails/activesupport";
import { InvalidSignature, MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { GID } from "./uri/gid.js";
import { GlobalID, type GlobalIDModel, type GlobalIDOptions } from "./global-id.js";

export type { GlobalIDModel };

const DEFAULT_PURPOSE = "default";

/** Monotonic counter for stable inspect() ids; mirrors Ruby's object_id. @internal */
let _nextObjectId = 0;

/** Class-level defaults — mirror Rails' `SignedGlobalID.verifier` / `.expires_in` attr_accessors. @internal */
let _classVerifier: MessageVerifier | undefined;
let _classExpiresIn: number | null | undefined;

export interface SignedGlobalIDOptions extends GlobalIDOptions {
  /** Rails-canonical purpose option (`options.fetch :for, DEFAULT_PURPOSE`). */
  for?: string | null;
  /** Number of seconds until expiration. `null` explicitly disables expiration (Rails: `expires_in: nil`). */
  expiresIn?: number | null;
  /** Explicit expiration time. `null` explicitly disables expiration (Rails: `expires_at: nil`). */
  expiresAt?: Temporal.Instant | null;
  /** Optional — falls back to `SignedGlobalID.verifier` when omitted. */
  verifier?: MessageVerifier;
  /** Custom GID query params (any extra keys become URI params). */
  [key: string]: unknown;
}

export interface ParseOptions extends GlobalIDOptions {
  /** Rails-canonical purpose option (`options.fetch :for, DEFAULT_PURPOSE`). */
  for?: string | null;
  /** Optional — falls back to `SignedGlobalID.verifier` when omitted. */
  verifier?: MessageVerifier;
}

/** Mirrors: SignedGlobalID::ExpiredMessage. */
export class ExpiredMessage extends Error {}

/** @internal */
interface SgidPayload {
  gid: string;
  purpose: string | null;
  expires_at: string | null;
}

export class SignedGlobalID extends GlobalID {
  readonly purpose: string | null;
  readonly expiresAt: Temporal.Instant | undefined;

  private readonly verifier: MessageVerifier;
  private _cached: string | undefined;
  /** Stable per-instance hex id used by inspect(). Rails uses object_id. */
  private readonly _objectId: string;

  /**
   * Mirrors: SignedGlobalID#initialize(gid, options) — `super` parses the GID
   * (Rails' URI::GID.parse, which raises on a malformed URI), then the
   * verifier/purpose/expiration are picked off the same options hash.
   */
  constructor(gid: string | GID, options: SignedGlobalIDOptions = {}) {
    super(gid, options);
    this.verifier = SignedGlobalID.pickVerifier(options);
    this.purpose = SignedGlobalID.pickPurpose(options);
    this.expiresAt = pickExpiration(options);
    this._objectId = (_nextObjectId++).toString(16).padStart(12, "0");
  }

  /**
   * Parse a signed SGID token. Returns null on invalid signature, expiration,
   * or purpose mismatch.
   *
   * Mirrors: SignedGlobalID.parse
   */
  static parse(sgid: string, options: ParseOptions = {}): SignedGlobalID | null {
    const verified = SignedGlobalID.verify(sgid, options);
    if (verified === null) return null;
    // The token's own expiry wins over any class-level default: an explicit
    // null tells pickExpiration "no expiration" (Rails: `expires_at: nil`).
    return new this(verified.uri, { ...options, expiresAt: verified.expiresAt ?? null });
  }

  // ─── Class-level config (Rails: attr_accessor :verifier, :expires_in) ─────

  /** Default verifier used when an SGID create/parse call omits the `verifier:` option. */
  static get verifier(): MessageVerifier | undefined {
    return _classVerifier;
  }
  static set verifier(v: MessageVerifier | undefined) {
    _classVerifier = v;
  }

  /** Default `expires_in` (seconds) for new SGIDs that omit both expiresIn and expiresAt. */
  static get expiresIn(): number | null | undefined {
    return _classExpiresIn;
  }
  static set expiresIn(v: number | null | undefined) {
    _classExpiresIn = v;
  }

  /**
   * Mirrors: SignedGlobalID.pick_verifier. Falls back to the class-level
   * verifier when the option isn't passed. Throws if neither is set.
   */
  static pickVerifier(options: { verifier?: MessageVerifier }): MessageVerifier {
    const v = options.verifier ?? _classVerifier;
    if (!v) {
      throw new Error(
        "Pass a `verifier:` option with a MessageVerifier instance, or set a default SignedGlobalID.verifier.",
      );
    }
    return v;
  }

  /** Mirrors: SignedGlobalID.pick_purpose. */
  static pickPurpose(options: { for?: string | null }): string | null {
    return options.for !== undefined ? options.for : DEFAULT_PURPOSE;
  }

  // ─── Verify dispatch (Rails private class methods) ────────────────────────

  /**
   * @internal Mirrors SignedGlobalID.verify — dispatches to the verifier-
   * validated path, then falls back to the legacy self-validated path.
   */
  static verify(
    sgid: string,
    options: ParseOptions,
  ): { uri: string; expiresAt: Temporal.Instant | undefined } | null {
    return (
      SignedGlobalID.verifyWithVerifierValidatedMetadata(sgid, options) ??
      SignedGlobalID.verifyWithLegacySelfValidatedMetadata(sgid, options)
    );
  }

  /**
   * @internal Mirrors verify_with_verifier_validated_metadata. Only
   * `ActiveSupport::MessageVerifier::InvalidSignature` is rescued
   * (`signed_global_id.rb:34-38`) — a missing verifier's error and any other
   * failure propagate. The verifier validates purpose + expires_at; the
   * embedded URI is then re-checked through the same `rescue nil` Rails'
   * `GlobalID.parse` (`global_id.rb:33`) applies to it.
   */
  static verifyWithVerifierValidatedMetadata(
    sgid: string,
    options: ParseOptions,
  ): { uri: string; expiresAt: Temporal.Instant | undefined } | null {
    const verifier = SignedGlobalID.pickVerifier(options);
    let raw: SgidPayload | null;
    try {
      raw = verifier.verify(sgid, {
        purpose: SignedGlobalID.pickPurpose(options),
      }) as SgidPayload | null;
    } catch (error) {
      if (error instanceof InvalidSignature) return null;
      throw error;
    }
    if (!raw || typeof raw !== "object" || typeof raw.gid !== "string") return null;
    if (raw.purpose !== SignedGlobalID.pickPurpose(options)) return null;
    try {
      GID.parse(raw.gid);
    } catch {
      return null;
    }
    let expiresAt: Temporal.Instant | undefined;
    if (raw.expires_at) {
      expiresAt = Temporal.Instant.from(raw.expires_at);
      if (Temporal.Instant.compare(expiresAt, currentTimeInstant()) <= 0) return null;
    }
    return { uri: raw.gid, expiresAt };
  }

  /**
   * @internal Mirrors verify_with_legacy_self_validated_metadata — Rails
   * 1.3.0 still parses SGIDs issued before the verifier-validated form.
   * Trails has no legacy SGIDs to read; the corresponding Ruby test
   * `parse is backwards compatible with the self validated metadata` is
   * on the permanent skip list (`scripts/api-compare/unported-files.ts`).
   * This implementation always returns null; kept for parity:api parity.
   */
  static verifyWithLegacySelfValidatedMetadata(
    _sgid: string,
    _options: ParseOptions,
  ): { uri: string; expiresAt: Temporal.Instant | undefined } | null {
    return null;
  }

  /**
   * @internal Mirrors raise_if_expired. Throws `ExpiredMessage` when
   * `expiresAt` (ISO 8601 string) is in the past; no-op for null/missing.
   * Only used by the legacy verify path in Rails; we expose it for parity.
   */
  static raiseIfExpired(expiresAt: string | null | undefined): void {
    if (!expiresAt) return;
    const instant = Temporal.Instant.from(expiresAt);
    if (Temporal.Instant.compare(instant, currentTimeInstant()) > 0) return;
    throw new ExpiredMessage("This signed global id has expired.");
  }

  toString(): string {
    if (this._cached) return this._cached;
    const payload: SgidPayload = {
      gid: this.uri.toString(),
      purpose: this.purpose,
      expires_at: this.expiresAt ? this.expiresAt.toString({ smallestUnit: "millisecond" }) : null,
    };
    this._cached = this.verifier.generate(payload, {
      purpose: this.purpose,
      expiresAt: this.expiresAt,
    });
    return this._cached;
  }

  toParam(): string {
    return this.toString();
  }

  /**
   * Mirrors: SignedGlobalID#== — equal iff URI and purpose match.
   *
   * Compares by value, not by class identity: TS treats src/ vs dist/
   * resolutions of this module as distinct classes due to private fields
   * (same trap base.ts works around for findSignedGlobalId), so an
   * `instanceof` check would falsely report two value-equal SGIDs as
   * different across module boundaries.
   */
  equals(other: SignedGlobalID): boolean {
    return other != null && this.uri.equals(other.uri) && this.purpose === other.purpose;
  }

  /** Mirrors: SignedGlobalID#inspect — `#<SignedGlobalID:0x...>` (stable per instance). */
  inspect(): string {
    return `#<SignedGlobalID:0x${this._objectId}>`;
  }
}

/** @internal */
function pickExpiration(
  options: Pick<SignedGlobalIDOptions, "expiresAt" | "expiresIn">,
): Temporal.Instant | undefined {
  // Rails parity:
  //   - explicit null   → disable expiration; wins over expiresIn (Rails nil)
  //   - real Instant    → use it
  //   - undefined       → treat as omitted; fall through to expiresIn
  //   - both omitted    → fall through to class-level SignedGlobalID.expiresIn
  if (options.expiresAt !== undefined) return options.expiresAt ?? undefined;
  const expiresIn = options.expiresIn !== undefined ? options.expiresIn : _classExpiresIn;
  if (expiresIn == null) return undefined;
  const ms = Math.round(expiresIn * 1000);
  return currentTimeInstant().add({ milliseconds: ms });
}

/** @internal — test use only: clear class-level config between tests. */
export function _resetSignedGlobalIDClassConfig(): void {
  _classVerifier = undefined;
  _classExpiresIn = undefined;
}
