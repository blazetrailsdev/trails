/**
 * Token generation and resolution for model records.
 *
 * Mirrors: ActiveRecord::TokenFor
 */

import { InvalidSignature, MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { ActiveSupportJSON, getEnv } from "@blazetrails/activesupport";
import type { Base } from "./base.js";

export { InvalidSignature };

let _tokenForSecret: string | (() => string) | null = null;
// `generated_token_verifier` is a `class_attribute`, so each class has its own
// slot that subclasses inherit until they assign their own (see resolvedVerifier
// / ownVerifier). Entries are tagged with the secret generation; bumping the
// generation on setTokenForSecret invalidates all cached verifiers without
// enumerating the WeakMap.
const tokenVerifierRegistry = new WeakMap<
  object,
  { verifier: MessageVerifier | null; gen: number }
>();
let _secretGeneration = 0;

/**
 * Configure the secret used for token generation/verification.
 * If not set, falls back to BLAZETRAILS_SECRET_KEY_BASE or
 * BLAZETRAILS_SIGNED_ID_SECRET env vars. Throws if no secret
 * is configured. Bumps the secret generation so cached verifiers are rebuilt
 * on the next token op (or `generated_token_verifier` read).
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
  _secretGeneration++;
}

/**
 * This class's *own* verifier slot (ignoring stale-generation entries), or
 * undefined when the class has never written. A present entry whose `verifier`
 * is null is an explicit nil shadow (Rails: `self.generated_token_verifier = nil`
 * assigns nil to this class), distinct from "no own slot".
 */
function ownVerifierEntry(modelClass: object): { verifier: MessageVerifier | null } | undefined {
  const entry = tokenVerifierRegistry.get(modelClass);
  return entry && entry.gen === _secretGeneration ? entry : undefined;
}

/**
 * Resolved `class_attribute` value: the nearest class on the chain with an own
 * slot wins — even a nil shadow stops the walk (so an explicit `= null` does not
 * inherit the parent's verifier). Returns null when nothing up the chain wrote.
 */
function resolvedVerifier(modelClass: object): MessageVerifier | null {
  let current: any = modelClass;
  while (current) {
    const entry = ownVerifierEntry(current);
    if (entry) return entry.verifier;
    current = Object.getPrototypeOf(current);
  }
  return null;
}

/**
 * Ruby's `Object#as_json` (core_ext/object/json.rb), which `payload_for` calls
 * on the block's return value: the JSON-ready projection of the value, so the
 * payload compares equal to the one decoded back out of a token.
 */
function asJson(value: unknown): unknown {
  return ActiveSupportJSON.decode(ActiveSupportJSON.encode(value));
}

function resolveSecret(): string {
  if (_tokenForSecret) {
    return typeof _tokenForSecret === "function" ? _tokenForSecret() : _tokenForSecret;
  }
  const envSecret = getEnv("BLAZETRAILS_SECRET_KEY_BASE") ?? getEnv("BLAZETRAILS_SIGNED_ID_SECRET");
  if (typeof envSecret === "string" && envSecret.length > 0) return envSecret;
  throw new Error(
    "TokenFor requires a configured secret. Call setTokenForSecret() " +
      "or set BLAZETRAILS_SECRET_KEY_BASE or BLAZETRAILS_SIGNED_ID_SECRET.",
  );
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

  messageVerifier(): MessageVerifier {
    // Rails: `defining_class.generated_token_verifier ||= MessageVerifier.new(...)`
    // — return the resolved (own or inherited) verifier if set, otherwise build
    // from the secret and assign it to the defining class's own slot.
    const cls = this.definingClass;
    let verifier = generatedTokenVerifier(cls);
    if (!verifier) {
      verifier = new MessageVerifier(resolveSecret());
      setGeneratedTokenVerifier(cls, verifier);
    }
    return verifier;
  }

  payloadFor(model: Base): unknown[] {
    // BigInt is not JSON-serializable; coerce to a plain number so the token
    // payload round-trips. PG bigserial PKs surface as BigInt (mirrors the
    // coercion in signed-id.ts#signedId).
    const coerce = (v: unknown): unknown => (typeof v === "bigint" ? Number(v) : v);
    const id = Array.isArray(model.id) ? (model.id as unknown[]).map(coerce) : coerce(model.id);
    return this.block ? [id, asJson(this.block(model))] : [id];
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
 * Registry of token definitions per model class.
 */
const tokenDefinitionRegistry = new WeakMap<object, Map<string, TokenDefinition>>();

/**
 * The nearest class on `modelClass`'s prototype chain (including itself) that has
 * its own registry entry — i.e. the resolved `class_attribute` value. A class
 * that has never written returns its parent's map (live inheritance); a class
 * that has written returns its own snapshot.
 */
function resolvedDefinitions(modelClass: object): Map<string, TokenDefinition> | undefined {
  let current: any = modelClass;
  while (current) {
    const map = tokenDefinitionRegistry.get(current);
    if (map) return map;
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

/**
 * The `token_definitions` hash. Ruby's Hash carries `fetch`, which every finder
 * goes through (`token_definitions.fetch(purpose)`), so the port hands the same
 * verb back rather than making each caller re-spell the unknown-purpose raise.
 */
type TokenDefinitionsHash = Readonly<Record<string, TokenDefinition>> & {
  fetch(purpose: string): TokenDefinition;
  merge(other: Record<string, TokenDefinition>): Record<string, TokenDefinition>;
};

/** `fetch`/`merge` are non-enumerable so the hash still iterates as
 * `purpose => definition`. */
function withFetch(entries: Record<string, TokenDefinition>): TokenDefinitionsHash {
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
    value(other: Record<string, TokenDefinition>): Record<string, TokenDefinition> {
      return { ...entries, ...other };
    },
  });
  return entries as TokenDefinitionsHash;
}

/**
 * Rails: `class_attribute :token_definitions, default: {}` — the per-model
 * `purpose => TokenDefinition` map populated by `generates_token_for`. The
 * `class_attribute` reader inherits the parent value until the subclass writes,
 * at which point `generates_token_for` snapshots the inherited hash via
 * `self.token_definitions = token_definitions.merge(...)`. So a subclass that
 * has declared its own token sees the inherited purposes captured at that point
 * (not parent purposes added afterwards). Trails seeds the subclass's own
 * snapshot on each `generates_token_for` write; the reader returns the
 * resolved map — the class's own snapshot, or the parent's map if it never wrote.
 *
 * Mirrors: ActiveRecord::TokenFor#token_definitions
 */
export function tokenDefinitions(modelClass: typeof Base): TokenDefinitionsHash {
  const map = resolvedDefinitions(modelClass);
  return withFetch(map ? Object.fromEntries(map) : {});
}

/**
 * Rails-shaped writer for `class_attribute :token_definitions` — Rails'
 * `generates_token_for` assigns `self.token_definitions = token_definitions.merge(...)`,
 * and external callers can replace the map outright. Stores the given hash as
 * this class's own registry entry (subclasses still inherit via the reader).
 *
 * Mirrors: ActiveRecord::TokenFor#token_definitions=
 * @internal
 */
export function setTokenDefinitions(
  modelClass: typeof Base,
  value: Record<string, TokenDefinition>,
): void {
  tokenDefinitionRegistry.set(modelClass, new Map(Object.entries(value)));
}

/**
 * Rails: `class_attribute :generated_token_verifier` — the MessageVerifier used
 * to sign/verify tokens, resolved per class (own slot, else inherited). The
 * reader returns nil until `message_verifier` lazily builds and memoizes it
 * (`||=`); mirror that by returning the resolved value (null before the first
 * token op) rather than forcing secret resolution, so reading the accessor
 * before any token is generated never throws.
 *
 * Mirrors: ActiveRecord::TokenFor#generated_token_verifier
 */
export function generatedTokenVerifier(modelClass: typeof Base): MessageVerifier | null {
  return resolvedVerifier(modelClass);
}

/**
 * Rails-shaped writer for `class_attribute :generated_token_verifier` — Rails
 * tests assign `ActiveRecord::Base.generated_token_verifier = MessageVerifier.new(...)`
 * to inject a verifier; `message_verifier`'s `||=` then returns it instead of
 * building from the secret. Assigns to this class's own slot (subclasses inherit
 * via the reader until they assign their own). Assigning null writes an explicit
 * nil shadow on this class — Rails' generated writer assigns to the class, so the
 * reader returns nil (not the parent's verifier) and the next token op lazily
 * builds this class's own verifier.
 *
 * Mirrors: ActiveRecord::TokenFor#generated_token_verifier=
 * @internal
 */
export function setGeneratedTokenVerifier(
  modelClass: typeof Base,
  verifier: MessageVerifier | null,
): void {
  tokenVerifierRegistry.set(modelClass, { verifier, gen: _secretGeneration });
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
    generator?: (record: any) => unknown;
  } = {},
): void {
  setTokenDefinitions(
    this,
    tokenDefinitions(this).merge({
      [purpose]: new TokenDefinition(this, purpose, options.expiresIn, options.generator),
    }),
  );
}

/**
 * Generate a token for a record.
 *
 * Mirrors: ActiveRecord::TokenFor#generate_token_for
 */
export function generateTokenFor(record: Base, purpose: string): string {
  return tokenDefinitions(record.constructor as typeof Base)
    .fetch(purpose)
    .generateToken(record);
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
