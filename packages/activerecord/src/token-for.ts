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
let _cachedVerifier: MessageVerifier | null = null;

/**
 * Configure the secret used for token generation/verification.
 * If not set, falls back to BLAZETRAILS_SECRET_KEY_BASE or
 * BLAZETRAILS_SIGNED_ID_SECRET env vars. Throws if no secret
 * is configured. Clears the cached verifier so the next token op
 * (or `generated_token_verifier` read) reflects the new secret.
 */
export function setTokenForSecret(secret: string | (() => string) | null): void {
  _tokenForSecret = secret;
  _cachedVerifier = null;
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
    // — return the existing value if set (including one injected via the writer),
    // otherwise lazily build from the secret and memoize.
    if (!_cachedVerifier) {
      _cachedVerifier = new MessageVerifier(resolveSecret());
    }
    return _cachedVerifier;
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

function getDefinitions(modelClass: typeof Base): Map<string, TokenDefinition> {
  if (!tokenDefinitionRegistry.has(modelClass)) {
    tokenDefinitionRegistry.set(modelClass, new Map());
  }
  return tokenDefinitionRegistry.get(modelClass)!;
}

function getDefinition(modelClass: typeof Base, purpose: string): TokenDefinition | undefined {
  let current: any = modelClass;
  while (current) {
    const map = tokenDefinitionRegistry.get(current);
    if (map?.has(purpose)) return map.get(purpose);
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

/**
 * Rails: `class_attribute :token_definitions, default: {}` — the per-model
 * `purpose => TokenDefinition` map populated by `generates_token_for`. The
 * `class_attribute` reader inherits the parent value, and `generates_token_for`
 * writes `self.token_definitions = token_definitions.merge(...)`, so a subclass
 * sees both inherited and own purposes (own overriding on collision). Trails
 * keeps the per-class maps in `tokenDefinitionRegistry`; merge the prototype
 * chain parent-first to reproduce the inherited-then-merged hash.
 *
 * Mirrors: ActiveRecord::TokenFor#token_definitions
 */
export function tokenDefinitions(
  modelClass: typeof Base,
): Readonly<Record<string, TokenDefinition>> {
  const chain: Map<string, TokenDefinition>[] = [];
  let current: any = modelClass;
  while (current) {
    const map = tokenDefinitionRegistry.get(current);
    if (map) chain.push(map);
    current = Object.getPrototypeOf(current);
  }
  const out: Record<string, TokenDefinition> = {};
  // Parent-first so a subclass purpose overrides an inherited one of the same name.
  for (const map of chain.reverse()) {
    for (const [purpose, def] of map) out[purpose] = def;
  }
  return out;
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
 * to sign/verify tokens. The reader returns nil until `message_verifier` lazily
 * builds and memoizes it (`||=`); mirror that by returning the current cache
 * (null before the first token op) rather than forcing secret resolution, so
 * reading the accessor before any token is generated never throws. Trails'
 * signing secret is process-global (`setTokenForSecret` / env), so the cache is
 * a single secret-keyed value rather than a per-class slot; the `modelClass`
 * arg is accepted for Rails-shaped call sites.
 *
 * Mirrors: ActiveRecord::TokenFor#generated_token_verifier
 */
export function generatedTokenVerifier(_modelClass: typeof Base): MessageVerifier | null {
  return _cachedVerifier;
}

/**
 * Rails-shaped writer for `class_attribute :generated_token_verifier` — Rails
 * tests assign `ActiveRecord::Base.generated_token_verifier = MessageVerifier.new(...)`
 * to inject a verifier; `message_verifier`'s `||=` then returns it instead of
 * building from the secret. A null clears the injection, reverting to lazy build.
 * The signing secret is process-global in trails, so the cache is shared rather
 * than per-class; the `modelClass` arg is accepted for Rails-shaped call sites.
 *
 * Mirrors: ActiveRecord::TokenFor#generated_token_verifier=
 */
export function setGeneratedTokenVerifier(
  _modelClass: typeof Base,
  verifier: MessageVerifier | null,
): void {
  _cachedVerifier = verifier;
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
  getDefinitions(modelClass).set(purpose, def);

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
