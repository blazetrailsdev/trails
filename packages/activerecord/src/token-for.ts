import { InvalidSignature, MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { fetch, merge } from "@blazetrails/ruby-compat";
import { asJson, getEnv, onLoad } from "@blazetrails/activesupport";
import type { Base } from "./base.js";

export { InvalidSignature };

function resolveSecret(): string | null {
  const envSecret = getEnv("BLAZETRAILS_SECRET_KEY_BASE") ?? getEnv("BLAZETRAILS_SIGNED_ID_SECRET");
  if (typeof envSecret === "string" && envSecret.length > 0) return envSecret;
  return null;
}

onLoad("active_record", function (this: typeof Base) {
  const secret = resolveSecret();
  this.generatedTokenVerifier ??= secret === null ? null : new MessageVerifier(secret);
});

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

export type TokenDefinitionsHash = Readonly<Record<string, TokenDefinition>>;

export function generatesTokenFor(
  this: typeof Base,
  purpose: string,
  { expiresIn }: { expiresIn?: number } = {},
  block?: (record: any) => unknown,
): void {
  this.tokenDefinitions = merge(this.tokenDefinitions, {
    [purpose]: new TokenDefinition(this, purpose, expiresIn, block),
  });
}

/** @missingRailsArgs fetch — PERMANENT */
export function generateTokenFor(this: Base, purpose: string): string {
  return fetch<TokenDefinition>(
    (this.constructor as typeof Base).tokenDefinitions,
    purpose,
  ).generateToken(this);
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
