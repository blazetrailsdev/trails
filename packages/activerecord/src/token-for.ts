import { InvalidSignature, MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { fetch, merge } from "@blazetrails/ruby-compat";
import { asJson, classAttribute, getEnv, included, onLoad } from "@blazetrails/activesupport";
import type { Base } from "./base.js";
import type { Relation } from "./relation.js";
import { UnknownPrimaryKey } from "./errors.js";

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

export const TokenFor = {
  [included](base: object): void {
    classAttribute.call(base, "tokenDefinitions", {
      instanceAccessor: false,
      instancePredicate: false,
      default: {},
    });
    classAttribute.call(base, "generatedTokenVerifier", {
      instanceAccessor: false,
      instancePredicate: false,
    });
  },
};

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
    return this.block ? [model.id, asJson(this.block.call(model, model))] : [model.id];
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
    const payload = this.messageVerifier().verified(token, { purpose: this.fullPurpose() }) as
      | unknown[]
      | null;
    let model: Base | null = null;
    if (payload != null) model = await block(payload[0]);
    return model && JSON.stringify(this.payloadFor(model)) === JSON.stringify(payload)
      ? model
      : null;
  }
}

export class RelationMethods<T extends Base = Base> {
  async findByTokenFor(this: Relation<T>, purpose: string, token: string): Promise<T | null> {
    if (this.model.primaryKey == null) throw new UnknownPrimaryKey(this);
    return (await fetch<TokenDefinition>(this.model.tokenDefinitions, purpose).resolveToken(
      token,
      (id) => this.findBy(new Map([[this.model.primaryKey, [id]]])),
    )) as T | null;
  }

  async findByTokenForBang(this: Relation<T>, purpose: string, token: string): Promise<T> {
    const record = await fetch<TokenDefinition>(this.model.tokenDefinitions, purpose).resolveToken(
      token,
      (id) => this.find(id) as Promise<Base>,
    );
    if (!record) throw new InvalidSignature();
    return record as T;
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
