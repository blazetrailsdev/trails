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
// `generated_token_verifier` is a `class_attribute`, so each class has its own
// slot that subclasses inherit until they assign their own (see resolvedVerifier
// / ownVerifierEntry).
const tokenVerifierRegistry = new WeakMap<object, { verifier: MessageVerifier | null }>();
// The value the railtie initializer assigns onto ActiveRecord::Base at boot
// (railtie.rb:328-334, `self.generated_token_verifier ||= app.message_verifier(...)`).
// trails has no railtie/application, so the boot-time assignment lands in this
// module-level slot, which the reader falls back to when no class has written.
let _defaultVerifier: MessageVerifier | null = null;

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

/**
 * This class's *own* verifier slot, or undefined when the class has never
 * written. A present entry whose `verifier`
 * is null is an explicit nil shadow (Rails: `self.generated_token_verifier = nil`
 * assigns nil to this class), distinct from "no own slot".
 */
function ownVerifierEntry(modelClass: object): { verifier: MessageVerifier | null } | undefined {
  return tokenVerifierRegistry.get(modelClass);
}

/**
 * Resolved `class_attribute` value: the nearest class on the chain with an own
 * slot wins — even a nil shadow stops the walk (so an explicit `= null` does not
 * inherit the parent's verifier). Falls back to the boot-time verifier the
 * railtie stand-in built, and is null when no secret is configured at all.
 */
function resolvedVerifier(modelClass: object): MessageVerifier | null {
  let current: any = modelClass;
  while (current) {
    const entry = ownVerifierEntry(current);
    if (entry) return entry.verifier;
    current = Object.getPrototypeOf(current);
  }
  return _defaultVerifier;
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
  _defaultVerifier = secret === null ? null : new MessageVerifier(secret);
}

buildDefaultVerifier();

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

  // token_for.rb:19-21 — `defining_class.generated_token_verifier`, a plain
  // class_attribute read. Ruby gets nil here when nothing configured a
  // verifier and NoMethodErrors on the next `generate`/`verified`; the
  // non-null assertion keeps the same shape for the callers below.
  messageVerifier(): MessageVerifier {
    return this.definingClass.generatedTokenVerifier!;
  }

  payloadFor(model: Base): unknown[] {
    // BigInt is not JSON-serializable; coerce to a plain number so the token
    // payload round-trips. PG bigserial PKs surface as BigInt (mirrors the
    // coercion in signed-id.ts#signedId).
    const coerce = (v: unknown): unknown => (typeof v === "bigint" ? Number(v) : v);
    const id = Array.isArray(model.id) ? (model.id as unknown[]).map(coerce) : coerce(model.id);
    // token_for.rb:24 — `model.instance_eval(&block)`: the block runs with the
    // model as `self`, and `instance_eval` also yields the receiver to the block.
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
 * to sign/verify tokens, resolved per class (own slot, else inherited, else the
 * boot-time value the railtie stand-in assigned — see setTokenForSecret).
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
 * reader returns nil rather than the parent's verifier.
 *
 * Mirrors: ActiveRecord::TokenFor#generated_token_verifier=
 * @internal
 */
export function setGeneratedTokenVerifier(
  modelClass: typeof Base,
  verifier: MessageVerifier | null,
): void {
  tokenVerifierRegistry.set(modelClass, { verifier });
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
  return (record.constructor as typeof Base).tokenDefinitions.fetch(purpose).generateToken(record);
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
