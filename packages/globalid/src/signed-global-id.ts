import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { getApp } from "./config.js";
import { buildGid, parseGid, type GidComponents } from "./uri/gid.js";
import type { GlobalIDModel } from "./global-id.js";

export type { GlobalIDModel };

const DEFAULT_PURPOSE = "default";

/** Option keys that are NOT forwarded as GID URI params. @internal */
// Mirrors GlobalID.create's `options.except(:app, :verifier, :for)` plus
// the SGID-specific expiration options. Any other key — including
// `purpose` — flows through to URI params, matching Rails: SGID does
// not reserve `purpose` as an option, only as the internal @purpose
// attr set via pick_purpose(:for).
const KNOWN_SGID_KEYS = new Set(["app", "for", "expiresIn", "expiresAt", "verifier"]);

/** Monotonic counter for stable inspect() ids; mirrors Ruby's object_id. @internal */
let _nextObjectId = 0;

/** Class-level defaults — mirror Rails' `SignedGlobalID.verifier` / `.expires_in` attr_accessors. @internal */
let _classVerifier: MessageVerifier | undefined;
let _classExpiresIn: number | null | undefined;

export interface SignedGlobalIDOptions {
  app?: string;
  /** Rails-canonical purpose option (`options.fetch :for, DEFAULT_PURPOSE`). */
  for?: string;
  /** Number of seconds until expiration. `null` explicitly disables expiration (Rails: `expires_in: nil`). */
  expiresIn?: number | null;
  /** Explicit expiration time. `null` explicitly disables expiration (Rails: `expires_at: nil`). */
  expiresAt?: Temporal.Instant | null;
  /** Optional — falls back to `SignedGlobalID.verifier` when omitted. */
  verifier?: MessageVerifier;
  /** Custom GID query params (any extra keys become URI params). */
  [key: string]: unknown;
}

export interface ParseOptions {
  /** Rails-canonical purpose option (`options.fetch :for, DEFAULT_PURPOSE`). */
  for?: string;
  /** Optional — falls back to `SignedGlobalID.verifier` when omitted. */
  verifier?: MessageVerifier;
}

/** Mirrors: SignedGlobalID::ExpiredMessage. */
export class ExpiredMessage extends Error {}

/** @internal */
interface SgidPayload {
  gid: string;
  purpose: string;
  expires_at: string | null;
}

export class SignedGlobalID {
  /** The raw GID URI string, e.g. `gid://MyApp/User/1` */
  readonly uri: string;
  readonly purpose: string;
  readonly expiresAt: Temporal.Instant | undefined;

  private readonly verifier: MessageVerifier;
  private _cached: string | undefined;
  private _components: GidComponents | undefined;
  /** Stable per-instance hex id used by inspect(). Rails uses object_id. */
  private readonly _objectId: string;

  private constructor(
    uri: string,
    purpose: string,
    expiresAt: Temporal.Instant | undefined,
    verifier: MessageVerifier,
  ) {
    this.uri = uri;
    this.purpose = purpose;
    this.expiresAt = expiresAt;
    this.verifier = verifier;
    this._objectId = (_nextObjectId++).toString(16).padStart(12, "0");
  }

  /** @internal — lazily parse and cache. */
  private _parts(): GidComponents {
    return (this._components ??= parseGid(this.uri));
  }

  /**
   * Create a SignedGlobalID for a model instance.
   *
   * Mirrors: SignedGlobalID.new
   */
  static create(model: GlobalIDModel, options: SignedGlobalIDOptions = {}): SignedGlobalID {
    const app = options.app ?? getApp();
    if (!app) {
      throw new Error(
        "An app is required to create a SignedGlobalID. Pass the :app option or call setApp() from @blazetrails/globalid.",
      );
    }
    const modelName = model.constructor.name;
    // Rails: arbitrary options beyond the known SGID keys become GID URI params.
    const filteredParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(options)) {
      if (!KNOWN_SGID_KEYS.has(k) && v != null) filteredParams[k] = String(v);
    }
    const uri = buildGid(
      app,
      modelName,
      model.id,
      Object.keys(filteredParams).length ? filteredParams : null,
    );

    const verifier = SignedGlobalID.pickVerifier(options);
    const purpose = SignedGlobalID.pickPurpose(options);
    const expiresAt = pickExpiration(options);

    return new SignedGlobalID(uri, purpose, expiresAt, verifier);
  }

  /**
   * Parse a signed SGID token. Returns null on invalid signature, expiration,
   * or purpose mismatch.
   *
   * Mirrors: SignedGlobalID.parse
   */
  static parse(sgid: string, options: ParseOptions = {}): SignedGlobalID | null {
    const verifier = SignedGlobalID.pickVerifier(options);
    const purpose = SignedGlobalID.pickPurpose(options);
    const verified = SignedGlobalID.verify(sgid, options);
    if (verified === null) return null;
    return new SignedGlobalID(verified.uri, purpose, verified.expiresAt, verifier);
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
  static pickPurpose(options: { for?: string }): string {
    return options.for ?? DEFAULT_PURPOSE;
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
   * @internal Mirrors verify_with_verifier_validated_metadata. Verifier
   * validates purpose + expires_at; we then re-check the embedded URI parses.
   */
  static verifyWithVerifierValidatedMetadata(
    sgid: string,
    options: ParseOptions,
  ): { uri: string; expiresAt: Temporal.Instant | undefined } | null {
    try {
      const verifier = SignedGlobalID.pickVerifier(options);
      const purpose = SignedGlobalID.pickPurpose(options);
      const raw = verifier.verified(sgid, { purpose }) as SgidPayload | null;
      if (!raw || typeof raw !== "object" || typeof raw.gid !== "string") return null;
      if (raw.purpose !== purpose) return null;
      parseGid(raw.gid);
      let expiresAt: Temporal.Instant | undefined;
      if (raw.expires_at) {
        expiresAt = Temporal.Instant.from(raw.expires_at);
        if (Temporal.Instant.compare(expiresAt, Temporal.Now.instant()) <= 0) return null;
      }
      return { uri: raw.gid, expiresAt };
    } catch {
      return null;
    }
  }

  /**
   * @internal Mirrors verify_with_legacy_self_validated_metadata — Rails
   * 1.3.0 still parses SGIDs issued before the verifier-validated form.
   * Trails has no legacy SGIDs to read; documented as out of scope in the
   * GlobalID plan, so this always returns null. Kept for api:compare parity.
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
    if (Temporal.Instant.compare(instant, Temporal.Now.instant()) > 0) return;
    throw new ExpiredMessage("This signed global id has expired.");
  }

  toString(): string {
    if (this._cached) return this._cached;
    const payload: SgidPayload = {
      gid: this.uri,
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

  /** Mirrors: GlobalID#model_id (inherited by SignedGlobalID). */
  get modelId(): string | string[] {
    return this._parts().modelId;
  }

  /** Mirrors: GlobalID#model_name (inherited by SignedGlobalID). */
  get modelName(): string {
    return this._parts().modelName;
  }

  /** Mirrors: GlobalID#params (inherited by SignedGlobalID). */
  get params(): Record<string, string> {
    return this._parts().params;
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
    return other != null && this.uri === other.uri && this.purpose === other.purpose;
  }

  /** Mirrors: SignedGlobalID#inspect — `#<SignedGlobalID:0x...>` (stable per instance). */
  inspect(): string {
    return `#<SignedGlobalID:0x${this._objectId}>`;
  }

  /** @internal */
  [Symbol.toPrimitive](_hint: string): string {
    return this.toString();
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
  return Temporal.Now.instant().add({ milliseconds: ms });
}

/** @internal — test use only: clear class-level config between tests. */
export function _resetSignedGlobalIDClassConfig(): void {
  _classVerifier = undefined;
  _classExpiresIn = undefined;
}
