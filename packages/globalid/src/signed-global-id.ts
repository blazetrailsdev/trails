import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { getApp } from "./config.js";
import { buildGid } from "./uri/gid.js";
import type { GlobalIDModel } from "./global-id.js";

export type { GlobalIDModel };

const DEFAULT_PURPOSE = "default";

/** Option keys that are NOT forwarded as GID URI params. @internal */
const KNOWN_SGID_KEYS = new Set(["app", "for", "purpose", "expiresIn", "expiresAt", "verifier"]);

export interface SignedGlobalIDOptions {
  app?: string;
  /** Rails-canonical purpose option. */
  for?: string;
  /** Alias of `for` kept for backward compatibility. */
  purpose?: string;
  expiresIn?: number;
  expiresAt?: Temporal.Instant;
  verifier: MessageVerifier;
  /** Custom GID query params (any extra keys become URI params). */
  [key: string]: unknown;
}

export interface ParseOptions {
  /** Rails-canonical purpose option. */
  for?: string;
  /** Alias of `for` kept for backward compatibility. */
  purpose?: string;
  verifier: MessageVerifier;
}

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
  }

  /**
   * Create a SignedGlobalID for a model instance.
   *
   * Mirrors: SignedGlobalID.new
   */
  static create(model: GlobalIDModel, options: SignedGlobalIDOptions): SignedGlobalID {
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

    const purpose = options.for ?? options.purpose ?? DEFAULT_PURPOSE;
    const expiresAt = pickExpiration(options);

    return new SignedGlobalID(uri, purpose, expiresAt, options.verifier);
  }

  /**
   * Parse a signed SGID token. Returns null on invalid signature, expiration,
   * or purpose mismatch.
   *
   * Mirrors: SignedGlobalID.parse (verify_with_verifier_validated_metadata path)
   */
  static parse(sgid: string, options: ParseOptions): SignedGlobalID | null {
    const purpose = options.for ?? options.purpose ?? DEFAULT_PURPOSE;
    const result = verifyToken(sgid, purpose, options.verifier);
    if (result === null) return null;
    const { uri, expiresAt } = result;
    return new SignedGlobalID(uri, purpose, expiresAt, options.verifier);
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

  /** @internal */
  [Symbol.toPrimitive](_hint: string): string {
    return this.toString();
  }
}

/** @internal */
function verifyToken(
  sgid: string,
  purpose: string,
  verifier: MessageVerifier,
): { uri: string; expiresAt: Temporal.Instant | undefined } | null {
  try {
    const raw = verifier.verified(sgid, { purpose }) as SgidPayload | null;
    if (!raw || typeof raw !== "object" || typeof raw.gid !== "string") return null;
    if (!raw.gid.startsWith("gid://")) return null;
    if (raw.purpose !== purpose) return null;
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

/** @internal */
function pickExpiration(
  options: Pick<SignedGlobalIDOptions, "expiresAt" | "expiresIn">,
): Temporal.Instant | undefined {
  if (options.expiresAt !== undefined) return options.expiresAt;
  if (options.expiresIn !== undefined) {
    const ms = Math.round(options.expiresIn * 1000);
    return Temporal.Now.instant().add({ milliseconds: ms });
  }
  return undefined;
}
