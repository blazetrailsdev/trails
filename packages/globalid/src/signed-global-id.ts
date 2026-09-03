import { currentTimeInstant } from "@blazetrails/activesupport";
import { InvalidSignature, MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { GID } from "./uri/gid.js";
import { GlobalID, type GlobalIDModel, type GlobalIDOptions } from "./global-id.js";

export type { GlobalIDModel };

const DEFAULT_PURPOSE = "default";

/** @internal */
let _nextObjectId = 0;

/** @internal */
let _classVerifier: MessageVerifier | undefined;
let _classExpiresIn: number | null | undefined;

export interface SignedGlobalIDOptions extends GlobalIDOptions {
  for?: string | null;
  expiresIn?: number | null;
  expiresAt?: Temporal.Instant | null;
  verifier?: MessageVerifier;
  [key: string]: unknown;
}

export interface ParseOptions extends GlobalIDOptions {
  for?: string | null;
  verifier?: MessageVerifier;
}

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
  private readonly _objectId: string;

  constructor(gid: string | GID, options: SignedGlobalIDOptions = {}) {
    super(gid, options);
    this.verifier = SignedGlobalID.pickVerifier(options);
    this.purpose = SignedGlobalID.pickPurpose(options);
    this.expiresAt = pickExpiration(options);
    this._objectId = (_nextObjectId++).toString(16).padStart(12, "0");
  }

  static parse(sgid: string, options: ParseOptions = {}): SignedGlobalID | null {
    const verified = SignedGlobalID.verify(sgid, options);
    if (verified === null) return null;
    return new this(verified.uri, { ...options, expiresAt: verified.expiresAt ?? null });
  }

  static get verifier(): MessageVerifier | undefined {
    return _classVerifier;
  }
  static set verifier(v: MessageVerifier | undefined) {
    _classVerifier = v;
  }

  static get expiresIn(): number | null | undefined {
    return _classExpiresIn;
  }
  static set expiresIn(v: number | null | undefined) {
    _classExpiresIn = v;
  }

  static pickVerifier(options: { verifier?: MessageVerifier }): MessageVerifier {
    const v = options.verifier ?? _classVerifier;
    if (!v) {
      throw new Error(
        "Pass a `verifier:` option with a MessageVerifier instance, or set a default SignedGlobalID.verifier.",
      );
    }
    return v;
  }

  static pickPurpose(options: { for?: string | null }): string | null {
    return options.for !== undefined ? options.for : DEFAULT_PURPOSE;
  }

  /** @internal */
  static verify(
    sgid: string,
    options: ParseOptions,
  ): { uri: string; expiresAt: Temporal.Instant | undefined } | null {
    return (
      SignedGlobalID.verifyWithVerifierValidatedMetadata(sgid, options) ??
      SignedGlobalID.verifyWithLegacySelfValidatedMetadata(sgid, options)
    );
  }

  /** @internal */
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

  /** @internal */
  static verifyWithLegacySelfValidatedMetadata(
    _sgid: string,
    _options: ParseOptions,
  ): { uri: string; expiresAt: Temporal.Instant | undefined } | null {
    return null;
  }

  /** @internal */
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

  equals(other: SignedGlobalID): boolean {
    return other != null && this.uri.equals(other.uri) && this.purpose === other.purpose;
  }

  inspect(): string {
    return `#<SignedGlobalID:0x${this._objectId}>`;
  }
}

/** @internal */
function pickExpiration(
  options: Pick<SignedGlobalIDOptions, "expiresAt" | "expiresIn">,
): Temporal.Instant | undefined {
  if (options.expiresAt !== undefined) return options.expiresAt ?? undefined;
  const expiresIn = options.expiresIn !== undefined ? options.expiresIn : _classExpiresIn;
  if (expiresIn == null) return undefined;
  const ms = Math.round(expiresIn * 1000);
  return currentTimeInstant().add({ milliseconds: ms });
}

/** @internal */
export function _resetSignedGlobalIDClassConfig(): void {
  _classVerifier = undefined;
  _classExpiresIn = undefined;
}
