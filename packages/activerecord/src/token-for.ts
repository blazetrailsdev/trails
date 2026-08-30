import { InvalidSignature, MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { KeyError } from "@blazetrails/ruby-compat";
import { asJson, getEnv } from "@blazetrails/activesupport";
import type { Base } from "./base.js";

export { InvalidSignature };

let _tokenForSecret: string | (() => string) | null = null;
let _assignBootVerifier: ((verifier: MessageVerifier | null) => void) | null = null;

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function registerGeneratedTokenVerifierSink(
  sink: (verifier: MessageVerifier | null) => void,
): void {
  _assignBootVerifier = sink;
  buildDefaultVerifier();
}

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

export class TokenDefinition {
  readonly definingClass: typeof Base;
  readonly purpose: string;
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
    return this.definingClass.generatedTokenVerifier!;
  }

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

export type TokenDefinitionsHash = Readonly<Record<string, TokenDefinition>> & {
  fetch(purpose: string): TokenDefinition;
  merge(other: Record<string, TokenDefinition>): TokenDefinitionsHash;
};

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function withFetch(entries: Record<string, TokenDefinition>): TokenDefinitionsHash {
  Object.defineProperty(entries, "fetch", {
    value(purpose: string): TokenDefinition {
      const definition = entries[purpose];
      if (definition === undefined) {
        throw new KeyError(`key not found: ${JSON.stringify(purpose)}`);
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

export function generateTokenFor(this: Base, purpose: string): string {
  return (this.constructor as typeof Base).tokenDefinitions.fetch(purpose).generateToken(this);
}

export async function findByTokenFor(
  this: typeof Base,
  purpose: string,
  token: string,
): Promise<Base | null> {
  return this.all().findByTokenFor(purpose, token);
}

export async function findByTokenForBang(
  this: typeof Base,
  purpose: string,
  token: string,
): Promise<Base> {
  return this.all().findByTokenForBang(purpose, token);
}
