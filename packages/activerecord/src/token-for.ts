/**
 * Token generation and resolution for model records.
 *
 * Mirrors: ActiveRecord::TokenFor
 */

import { InvalidSignature, MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { asJson, getEnv } from "@blazetrails/activesupport";
import type { Base } from "./base.js";

export { InvalidSignature };

let _tokenForSecret: string | (() => string) | null = null;
// The sink base.ts installs so the boot-time verifier lands on
// `ActiveRecord::Base.generated_token_verifier`, which is where the railtie
// initializer assigns it (railtie.rb:328-334,
// `self.generated_token_verifier ||= app.message_verifier(...)`). token-for.ts
// cannot name `Base` — base.ts imports it at runtime, so a reverse runtime
// import would close a cycle — so base.ts hands the assignment down instead.
let _assignBootVerifier: ((verifier: MessageVerifier | null) => void) | null = null;

/**
 * Install the boot-time `generated_token_verifier` assignment. Same trails-only
 * railtie seam as {@link setTokenForSecret}, split out because the assignment
 * target lives in base.ts.
 *
 * @internal
 * @noRailsEquivalent PERMANENT trails has no railtie/application, so the
 * railtie.rb:328-334 initializer that assigns
 * `ActiveRecord::Base.generated_token_verifier` has to be injected from base.ts.
 */
export function registerGeneratedTokenVerifierSink(
  sink: (verifier: MessageVerifier | null) => void,
): void {
  _assignBootVerifier = sink;
  buildDefaultVerifier();
}

/**
 * Configure the secret used for token generation/verification.
 * If not set, falls back to BLAZETRAILS_SECRET_KEY_BASE or
 * BLAZETRAILS_SIGNED_ID_SECRET env vars. Rebuilds the boot-time verifier from
 * the new secret, mirroring the railtie initializer's assignment.
 *
 * Trails-only seam with no Rails counterpart. `token_for.rb` itself resolves no
 * secret — line 11 only declares the `generated_token_verifier` class_attribute.
 * The verifier is supplied by the railtie initializer
 * `"active_record.generated_token_verifier"` (railtie.rb:328-334), which assigns
 * `app.message_verifier("active_record/token_for")`; that resolves through
 * `Rails::Application#message_verifiers` (application.rb:208-213) down to
 * `#secret_key_base` (application.rb:477-479). All of that is railtie/application
 * state trails has no analogue for, so the secret is injected here instead. Not a
 * writer for any Ruby attribute — the Ruby attribute is
 * `generated_token_verifier=`, which trails already ports.
 */
export function setTokenForSecret(secret: string | (() => string) | null): void {
  _tokenForSecret = secret;
  buildDefaultVerifier();
}

function resolveSecret(): string | null {
  if (_tokenForSecret) {
    return typeof _tokenForSecret === "function" ? _tokenForSecret() : _tokenForSecret;
  }
  const envSecret = getEnv("BLAZETRAILS_SECRET_KEY_BASE") ?? getEnv("BLAZETRAILS_SIGNED_ID_SECRET");
  if (typeof envSecret === "string" && envSecret.length > 0) return envSecret;
  return null;
}

function buildDefaultVerifier(): void {
  const secret = resolveSecret();
  _assignBootVerifier?.(secret === null ? null : new MessageVerifier(secret));
}

/**
 * TokenDefinition — encapsulates token behavior for a specific purpose.
 * Stores the defining class, purpose, expiration, and optional block
 * that embeds data in the token for invalidation checks.
 *
 * Mirrors: ActiveRecord::TokenFor::TokenDefinition
 */
export class TokenDefinition {
  readonly definingClass: typeof Base;
  readonly purpose: string;
  /** Expiration in seconds, matching Rails Duration semantics. */
  readonly expiresIn: number | undefined;
  readonly block: ((record: any) => unknown) | undefined;

  constructor(
    definingClass: typeof Base,
    purpose: string,
    expiresIn: number | undefined,
    block: ((record: any) => unknown) | undefined,
  ) {
    this.definingClass = definingClass;
    this.purpose = purpose;
    this.expiresIn = expiresIn;
    this.block = block;
  }

  fullPurpose(): string {
    return [this.definingClass.name, this.purpose, this.expiresIn ?? ""].join("\n");
  }

  /**
   * Mirrors: ActiveRecord::TokenFor::TokenDefinition#message_verifier
   * (token_for.rb:19-21) — a plain class_attribute read. Ruby gets nil here
   * when nothing configured a verifier and NoMethodErrors on the next
   * `generate`/`verified`; the non-null assertion keeps that shape.
   */
  messageVerifier(): MessageVerifier {
    return this.definingClass.generatedTokenVerifier!;
  }

  /**
   * Mirrors: ActiveRecord::TokenFor::TokenDefinition#payload_for
   * (token_for.rb:23-25). `model.instance_eval(&block)` runs the block with the
   * model as `self`, and yields the receiver to it, so both are passed here.
   * BigInt is not JSON-serializable; PG bigserial PKs surface as BigInt, so the
   * id is coerced exactly as signed-id.ts#signedId coerces it.
   */
  payloadFor(model: Base): unknown[] {
    const coerce = (v: unknown): unknown => (typeof v === "bigint" ? Number(v) : v);
    const id = Array.isArray(model.id) ? (model.id as unknown[]).map(coerce) : coerce(model.id);
    return this.block ? [id, asJson(this.block.call(model, model))] : [id];
  }

  generateToken(model: Base): string {
    return this.messageVerifier().generate(this.payloadFor(model), {
      purpose: this.fullPurpose(),
      expiresIn: this.expiresIn,
    });
  }

  // `block` is Rails' bare `yield(payload[0])` — the finder the caller supplies
  // as a block (`resolve_token(token) { |id| find_by(...) }`).
  async resolveToken(
    token: string,
    block: (id: unknown) => Promise<Base | null>,
  ): Promise<Base | null> {
    const verified = this.messageVerifier().verified(token, { purpose: this.fullPurpose() });
    const payload = Array.isArray(verified) && verified.length > 0 ? verified : null;
    const model = payload ? await block(payload[0]) : null;
    return model && JSON.stringify(this.payloadFor(model)) === JSON.stringify(payload)
      ? model
      : null;
  }
}

/**
 * The `token_definitions` hash. Ruby's Hash carries `fetch`, which every finder
 * goes through (`token_definitions.fetch(purpose)`), so the port hands the same
 * verb back rather than making each caller re-spell the unknown-purpose raise.
 */
export type TokenDefinitionsHash = Readonly<Record<string, TokenDefinition>> & {
  fetch(purpose: string): TokenDefinition;
  merge(other: Record<string, TokenDefinition>): TokenDefinitionsHash;
};

/**
 * `fetch`/`merge` are non-enumerable so the hash still iterates as
 * `purpose => definition`. Applied to the `token_definitions` class_attribute's
 * default and to every `merge` result, so the whole `class_attribute` chain
 * carries Ruby's Hash verbs.
 *
 * @internal
 * @noRailsEquivalent PERMANENT a Ruby Hash carries `fetch`/`merge`; a JS object
 * does not, and `token_definitions.fetch(purpose)` (token_for.rb:42-51) is the
 * Rails call every finder makes.
 */
export function withFetch(entries: Record<string, TokenDefinition>): TokenDefinitionsHash {
  Object.defineProperty(entries, "fetch", {
    value(purpose: string): TokenDefinition {
      const definition = entries[purpose];
      if (definition === undefined) {
        const error = new Error(`key not found: ${JSON.stringify(purpose)}`);
        error.name = "KeyError";
        throw error;
      }
      return definition;
    },
  });
  Object.defineProperty(entries, "merge", {
    value(other: Record<string, TokenDefinition>): TokenDefinitionsHash {
      return withFetch({ ...entries, ...other });
    },
  });
  return entries as TokenDefinitionsHash;
}

/**
 * Declare a token purpose on a model class.
 *
 * Mirrors: ActiveRecord::TokenFor::ClassMethods#generates_token_for
 */
export function generatesTokenFor(
  this: typeof Base,
  purpose: string,
  options: {
    expiresIn?: number;
    block?: (record: any) => unknown;
  } = {},
): void {
  this.tokenDefinitions = this.tokenDefinitions.merge({
    [purpose]: new TokenDefinition(this, purpose, options.expiresIn, options.block),
  });
}

/**
 * Generate a token for a record.
 *
 * Mirrors: ActiveRecord::TokenFor#generate_token_for
 */
export function generateTokenFor(this: Base, purpose: string): string {
  return (this.constructor as typeof Base).tokenDefinitions.fetch(purpose).generateToken(this);
}

/**
 * Find a record by token. Returns null if invalid.
 *
 * Mirrors: ActiveRecord::TokenFor::ClassMethods#find_by_token_for
 */
export async function findByTokenFor(
  this: typeof Base,
  purpose: string,
  token: string,
): Promise<Base | null> {
  return this.all().findByTokenFor(purpose, token);
}

/**
 * Find a record by token. Throws if invalid.
 *
 * Mirrors: ActiveRecord::TokenFor::ClassMethods#find_by_token_for!
 */
export async function findByTokenForBang(
  this: typeof Base,
  purpose: string,
  token: string,
): Promise<Base> {
  return this.all().findByTokenForBang(purpose, token);
}
