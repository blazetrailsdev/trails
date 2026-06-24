/**
 * Token generation and resolution for model records.
 *
 * Mirrors: ActiveRecord::TokenFor
 */

import { InvalidSignature, MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { getEnv } from "@blazetrails/activesupport";
import { UnknownPrimaryKey } from "./errors.js";
import type { Base } from "./base.js";

/** Rails' `find_by_token_for` resolves through `primary_key`, which raises
 * UnknownPrimaryKey for a table with no primary key. */
function requirePrimaryKey(modelClass: typeof Base): string | string[] {
  const pk = modelClass.primaryKey as string | string[] | null | undefined;
  const present = Array.isArray(pk)
    ? pk.length > 0 && pk.every((k) => typeof k === "string" && k.length > 0)
    : typeof pk === "string" && pk.length > 0;
  if (!present) throw new UnknownPrimaryKey(modelClass);
  return pk as string | string[];
}

export { InvalidSignature };

let _tokenForSecret: string | (() => string) | null = null;
// `generated_token_verifier` is a `class_attribute`, so each class has its own
// slot that subclasses inherit until they assign their own (see resolvedVerifier
// / ownVerifier). Entries are tagged with the secret generation; bumping the
// generation on setTokenForSecret invalidates all cached verifiers without
// enumerating the WeakMap.
const tokenVerifierRegistry = new WeakMap<object, { verifier: MessageVerifier; gen: number }>();
let _secretGeneration = 0;

/**
 * Configure the secret used for token generation/verification.
 * If not set, falls back to BLAZETRAILS_SECRET_KEY_BASE or
 * BLAZETRAILS_SIGNED_ID_SECRET env vars. Throws if no secret
 * is configured. Bumps the secret generation so cached verifiers are rebuilt
 * on the next token op (or `generated_token_verifier` read).
 */
export function setTokenForSecret(secret: string | (() => string) | null): void {
  _tokenForSecret = secret;
  _secretGeneration++;
}

/** This class's own verifier slot, or null (ignoring stale-generation entries). */
function ownVerifier(modelClass: object): MessageVerifier | null {
  const entry = tokenVerifierRegistry.get(modelClass);
  return entry && entry.gen === _secretGeneration ? entry.verifier : null;
}

/** Resolved `class_attribute` value: own slot, else nearest inherited. */
function resolvedVerifier(modelClass: object): MessageVerifier | null {
  let current: any = modelClass;
  while (current) {
    const v = ownVerifier(current);
    if (v) return v;
    current = Object.getPrototypeOf(current);
  }
  return null;
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
    let verifier = resolvedVerifier(cls);
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
    return this.block ? [id, this.block(model)] : [id];
  }

  generateToken(model: Base): string {
    const data = this.payloadFor(model);
    return this.messageVerifier().generate(data, {
      purpose: this.fullPurpose(),
      expiresIn: this.expiresIn,
    });
  }

  async resolveToken(
    token: string,
    finder: (id: unknown) => Promise<Base | null>,
  ): Promise<Base | null> {
    const verified = this.messageVerifier().verified(token, { purpose: this.fullPurpose() });
    const payload = Array.isArray(verified) && verified.length > 0 ? verified : null;
    const record = payload ? await finder(payload[0]) : null;
    return record && JSON.stringify(this.payloadFor(record)) === JSON.stringify(payload)
      ? record
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
 * The class's *own* registry entry, seeding it on first write with a snapshot of
 * the currently-inherited definitions — mirroring the class-attribute write
 * `self.token_definitions = token_definitions.merge(...)`, which reads the
 * inherited hash *once* and assigns the result to this class's own slot. After
 * that, later parent writes no longer affect this class.
 */
function ownDefinitions(modelClass: typeof Base): Map<string, TokenDefinition> {
  let map = tokenDefinitionRegistry.get(modelClass);
  if (!map) {
    const inherited = resolvedDefinitions(Object.getPrototypeOf(modelClass));
    map = new Map(inherited ?? []);
    tokenDefinitionRegistry.set(modelClass, map);
  }
  return map;
}

function getDefinition(modelClass: typeof Base, purpose: string): TokenDefinition | undefined {
  return resolvedDefinitions(modelClass)?.get(purpose);
}

/**
 * Rails: `class_attribute :token_definitions, default: {}` — the per-model
 * `purpose => TokenDefinition` map populated by `generates_token_for`. The
 * `class_attribute` reader inherits the parent value until the subclass writes,
 * at which point `generates_token_for` snapshots the inherited hash via
 * `self.token_definitions = token_definitions.merge(...)`. So a subclass that
 * has declared its own token sees the inherited purposes captured at that point
 * (not parent purposes added afterwards). Trails seeds the subclass's own
 * snapshot on first write (see `ownDefinitions`); the reader returns the
 * resolved map — the class's own snapshot, or the parent's map if it never wrote.
 *
 * Mirrors: ActiveRecord::TokenFor#token_definitions
 */
export function tokenDefinitions(
  modelClass: typeof Base,
): Readonly<Record<string, TokenDefinition>> {
  const map = resolvedDefinitions(modelClass);
  return map ? Object.fromEntries(map) : {};
}

/**
 * Rails-shaped writer for `class_attribute :token_definitions` — Rails'
 * `generates_token_for` assigns `self.token_definitions = token_definitions.merge(...)`,
 * and external callers can replace the map outright. Stores the given hash as
 * this class's own registry entry (subclasses still inherit via the reader).
 *
 * Mirrors: ActiveRecord::TokenFor#token_definitions=
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
 * via the reader until they assign their own). A null clears this class's slot,
 * reverting to inherited / lazy build.
 *
 * Mirrors: ActiveRecord::TokenFor#generated_token_verifier=
 */
export function setGeneratedTokenVerifier(
  modelClass: typeof Base,
  verifier: MessageVerifier | null,
): void {
  if (verifier) {
    tokenVerifierRegistry.set(modelClass, { verifier, gen: _secretGeneration });
  } else {
    tokenVerifierRegistry.delete(modelClass);
  }
}

/**
 * Declare a token purpose on a model class.
 *
 * Mirrors: ActiveRecord::TokenFor::ClassMethods#generates_token_for
 */
export function generatesTokenFor(
  modelClass: typeof Base,
  purpose: string,
  options: {
    expiresIn?: number;
    generator?: (record: any) => unknown;
  } = {},
): void {
  const def = new TokenDefinition(modelClass, purpose, options.expiresIn, options.generator);
  ownDefinitions(modelClass).set(purpose, def);

  if (!(modelClass.prototype as any).generateTokenFor) {
    Object.defineProperty(modelClass.prototype, "generateTokenFor", {
      value: function (this: Base, purposeName: string): string {
        return generateTokenFor(this, purposeName);
      },
      writable: true,
      configurable: true,
    });
  }

  if (!(modelClass as any).findByTokenFor) {
    Object.defineProperty(modelClass, "findByTokenFor", {
      value: async function (
        this: typeof Base,
        purposeName: string,
        token: string,
      ): Promise<Base | null> {
        return findByTokenFor(this, purposeName, token);
      },
      writable: true,
      configurable: true,
    });
  }

  if (!(modelClass as any).findByTokenForBang) {
    Object.defineProperty(modelClass, "findByTokenForBang", {
      value: async function (this: typeof Base, purposeName: string, token: string): Promise<Base> {
        return findByTokenForBang(this, purposeName, token);
      },
      writable: true,
      configurable: true,
    });
  }
}

/**
 * Generate a token for a record.
 *
 * Mirrors: ActiveRecord::TokenFor#generate_token_for
 */
export function generateTokenFor(record: Base, purpose: string): string {
  const def = getDefinition(record.constructor as typeof Base, purpose);
  if (!def) throw new Error(`Unknown token purpose: ${purpose}`);
  return def.generateToken(record);
}

/**
 * Find a record by token. Returns null if invalid.
 *
 * Mirrors: ActiveRecord::TokenFor::ClassMethods#find_by_token_for
 */
export async function findByTokenFor(
  modelClass: typeof Base,
  purpose: string,
  token: string,
): Promise<Base | null> {
  // Rails (token_for.rb:42-43) checks `model.primary_key` first, then
  // `token_definitions.fetch(purpose)` — so a no-PK model raises
  // UnknownPrimaryKey even for an unknown purpose.
  const pk = requirePrimaryKey(modelClass);
  const def = getDefinition(modelClass, purpose);
  if (!def) throw new Error(`Unknown token purpose: ${purpose}`);
  return def.resolveToken(token, async (id) => {
    if (typeof pk === "string") {
      return modelClass.findBy({ [pk]: id });
    }
    if (!Array.isArray(id) || id.length !== pk.length) return null;
    const conditions = Object.fromEntries(pk.map((key, i) => [key, id[i]]));
    return modelClass.findBy(conditions);
  });
}

/**
 * Find a record by token. Throws if invalid.
 *
 * Mirrors: ActiveRecord::TokenFor::ClassMethods#find_by_token_for!
 */
export async function findByTokenForBang(
  modelClass: typeof Base,
  purpose: string,
  token: string,
): Promise<Base> {
  // Rails `find_by_token_for!` (token_for.rb:50-51) has NO primary_key guard
  // (unlike the non-bang path): it goes straight to `token_definitions
  // .fetch(purpose)` — which raises KeyError for an unknown purpose, distinct
  // from the InvalidSignature raised for a bad/expired token — then `find(id)`
  // (which itself surfaces UnknownPrimaryKey for a no-PK model).
  const def = getDefinition(modelClass, purpose);
  if (!def) throw new Error(`Unknown token purpose: ${purpose}`);
  const result = await def.resolveToken(token, (id) => modelClass.find(id));
  if (!result) throw new InvalidSignature();
  return result;
}
