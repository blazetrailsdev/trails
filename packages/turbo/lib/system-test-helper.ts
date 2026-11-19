import { isPresent } from "@blazetrails/activesupport";
import { include, rbModName, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { StreamName } from "./app/channels/turbo/streams/stream-name.js";
import { Turbo } from "./turbo-trails.js";

type Locator = {
  all(): Promise<Locator[]>;
  locator(selector: string): Locator;
  count(): Promise<number>;
  waitFor(options: { state: "attached" | "detached"; timeout?: number }): Promise<void>;
};
type SystemTestHost = {
  page(): Promise<{
    locator(selector: string): Locator;
    waitForFunction<A>(fn: (arg: A) => boolean, arg: A): Promise<unknown>;
  }>;
};
type AttributeValue = boolean | string | null;
type TurboCableStreamSourceOptions = {
  connected?: AttributeValue;
  channel?: unknown;
  signedStreamName?: unknown;
  count?: number;
};

/** @noRailsEquivalent PERMANENT */
function turboCableStreamSource(
  locator: unknown,
  { connected, channel, signedStreamName }: TurboCableStreamSourceOptions,
): string {
  let xpath = `.//*[local-name() = 'turbo-cable-stream-source']`;
  xpath = where(xpath, reduce(new SignedStreamNameConditions(locator)));
  if (connected !== undefined) xpath = addAttributeCondition(xpath, "connected", connected);
  if (channel !== undefined)
    xpath = addAttributeCondition(
      xpath,
      "channel",
      (typeof channel === "function" ? rbModName(channel) : null) ?? (channel as AttributeValue),
    );
  if (signedStreamName !== undefined) {
    if (signedStreamName === true || signedStreamName === false || signedStreamName === null) {
      xpath = addAttributeCondition(xpath, "signed-stream-name", signedStreamName);
    } else {
      xpath = where(xpath, reduce(new SignedStreamNameConditions(signedStreamName)));
    }
  }
  return `xpath=${xpath}`;
}

/** @noRailsEquivalent PERMANENT */
function where(xpath: string, condition: string | null): string {
  return condition === null ? xpath : `${xpath}[${condition}]`;
}

/** @noRailsEquivalent PERMANENT */
function reduce(conditions: SignedStreamNameConditions): string | null {
  const yielded: string[] = [];
  conditions.each((condition) => yielded.push(condition));
  return yielded.length === 0 ? null : yielded.join(" or ");
}

/** @noRailsEquivalent PERMANENT */
function addAttributeCondition(xpath: string, name: string, value: AttributeValue): string {
  if (value === true) return where(xpath, `@${name}`);
  if (value === false || value === null) return where(xpath, `not(@${name})`);
  return where(xpath, `@${name} = '${value}'`);
}

export async function connectTurboCableStreamSources(
  this: SystemTestHost,
  options: TurboCableStreamSourceOptions = {},
): Promise<void> {
  const page = await this.page();
  for (const element of await page
    .locator(turboCableStreamSource(null, { ...options, connected: false }))
    .all()) {
    await element.locator("xpath=self::*[@connected]").waitFor({ state: "attached" });
  }
}

/** @inventedArm if — PERMANENT */
export async function assertTurboCableStreamSource(
  this: SystemTestHost,
  locator: unknown = null,
  options: TurboCableStreamSourceOptions = {},
): Promise<void> {
  if (locator !== null && typeof locator === "object" && !Array.isArray(locator)) {
    if (!rbObjRespondTo(locator, "toKey")) {
      options = locator as TurboCableStreamSourceOptions;
      locator = null;
    }
  }
  const page = await this.page();
  const selector = turboCableStreamSource(locator, options);
  if (options.count === undefined) {
    await page.locator(`${selector} >> nth=0`).waitFor({ state: "attached" });
  } else {
    await page.waitForFunction(
      ([xpath, count]) =>
        document.evaluate(`count(${xpath})`, document, null, XPathResult.NUMBER_TYPE, null)
          .numberValue === count,
      [selector.slice("xpath=".length), options.count] as const,
    );
  }
}

/** @inventedArm if — PERMANENT */
export async function assertNoTurboCableStreamSource(
  this: SystemTestHost,
  locator: unknown = null,
  options: TurboCableStreamSourceOptions = {},
): Promise<void> {
  if (locator !== null && typeof locator === "object" && !Array.isArray(locator)) {
    if (!rbObjRespondTo(locator, "toKey")) {
      options = locator as TurboCableStreamSourceOptions;
      locator = null;
    }
  }
  const page = await this.page();
  const selector = turboCableStreamSource(locator, options);
  await page.waitForFunction(
    ([xpath, count]) => {
      const found = document.evaluate(
        `count(${xpath})`,
        document,
        null,
        XPathResult.NUMBER_TYPE,
        null,
      ).numberValue;
      return count === null ? found === 0 : found !== count;
    },
    [selector.slice("xpath=".length), options.count ?? null] as const,
  );
}

/** @internal */
export class SignedStreamNameConditions {
  declare signedStreamName: (streamables: unknown) => string;
  declare streamNameFrom: (streamables: unknown) => string;
  private _value: unknown;

  constructor(value: unknown) {
    this._value = value;
  }

  attribute(): string {
    return "@signed-stream-name";
  }

  each(block: (condition: string) => void): void {
    if (typeof this._value === "string") {
      block(`${this.attribute()} = '${this._value}'`);
      block(`${this.attribute()} = '${this.signedStreamName(this._value)}'`);
    } else if (Array.isArray(this._value) || rbObjRespondTo(this._value, "toKey")) {
      block(`${this.attribute()} = '${this.signedStreamName(this._value)}'`);
    } else if (isPresent(this._value)) {
      block(`${this.attribute()} = '${this._value as string}'`);
    }
  }
}
include(SignedStreamNameConditions, StreamName);

export const SystemTestHelper = {
  connectTurboCableStreamSources,
  assertTurboCableStreamSource,
  assertNoTurboCableStreamSource,
  SignedStreamNameConditions,
};
Object.assign(Turbo, { SystemTestHelper });
