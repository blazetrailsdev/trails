import { isPresent } from "@blazetrails/activesupport";
import { include, rbModName, rbObjRespondTo, reduce } from "@blazetrails/ruby-compat";
import { StreamName } from "./app/channels/turbo/streams/stream-name.js";
import { Turbo } from "./turbo-trails.js";

type ElementHandle = object;
type Locator = {
  all(): Promise<Locator[]>;
  elementHandle(): Promise<ElementHandle | null>;
};
type Page = {
  locator(selector: string): Locator;
  waitForFunction<A>(fn: (arg: A) => boolean, arg: A): Promise<unknown>;
};
type SystemTestHost = { page(): Promise<Page> };
type AttributeValue = boolean | string | RegExp | null;
type TurboCableStreamSourceOptions = {
  connected?: AttributeValue;
  channel?: unknown;
  signedStreamName?: unknown;
  count?: number;
};
type Block = ((element: ElementHandle) => unknown) | null;
type RegexpFilter = [attribute: string, source: string, flags: string];
type Query = { xpath: string; regexps: RegexpFilter[] };
type Expectation = Query & {
  context: ElementHandle | null;
  count: number | null;
  negate: boolean;
};

/** @noRailsEquivalent PERMANENT */
function turboCableStreamSource(
  locator: unknown,
  { connected, channel, signedStreamName }: TurboCableStreamSourceOptions,
  axis = ".//",
): Query {
  const query: Query = {
    xpath: `${axis}*[local-name() = 'turbo-cable-stream-source']`,
    regexps: [],
  };
  where(query, orConditions(new SignedStreamNameConditions(locator)));
  if (connected !== undefined) addAttributeConditions(query, "connected", connected);
  if (channel !== undefined) {
    addAttributeConditions(
      query,
      "channel",
      (typeof channel === "function" ? rbModName(channel) : null) ?? (channel as AttributeValue),
    );
  }
  if (signedStreamName !== undefined) {
    if (
      signedStreamName === true ||
      signedStreamName === false ||
      signedStreamName === null ||
      signedStreamName instanceof RegExp
    ) {
      addAttributeConditions(query, "signed-stream-name", signedStreamName);
    } else {
      where(query, orConditions(new SignedStreamNameConditions(signedStreamName)));
    }
  }
  return query;
}

/** @noRailsEquivalent PERMANENT */
function orConditions(conditions: SignedStreamNameConditions): string | null {
  return (reduce(conditions, (memo: unknown, condition: unknown) => `${memo} or ${condition}`) ??
    null) as string | null;
}

/** @noRailsEquivalent PERMANENT */
function where(query: Query, condition: string | null): void {
  if (condition !== null) query.xpath += `[${condition}]`;
}

/** @noRailsEquivalent PERMANENT */
function addAttributeConditions(query: Query, name: string, value: AttributeValue): void {
  if (value instanceof RegExp) {
    where(query, `@${name}`);
    query.regexps.push([name, value.source, value.flags]);
  } else if (value === true) {
    where(query, `@${name}`);
  } else if (value === false || value === null) {
    where(query, `not(@${name})`);
  } else {
    where(query, `@${name} = ${stringLiteral(value)}`);
  }
}

/** @noRailsEquivalent PERMANENT */
function stringLiteral(string: string): string {
  if (string.includes("'")) {
    return `concat(${string
      .split("'")
      .map((substr) => `'${substr}'`)
      .join(`,"'",`)})`;
  } else {
    return `'${string}'`;
  }
}

/** @noRailsEquivalent PERMANENT */
function isSatisfied({ xpath, regexps, context, count, negate }: Expectation): boolean {
  const result = document.evaluate(
    xpath,
    (context as Node | null) ?? document,
    null,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null,
  );
  let found = 0;
  for (let i = 0; i < result.snapshotLength; i++) {
    const node = result.snapshotItem(i) as Element;
    if (
      regexps.every(([attribute, source, flags]) =>
        new RegExp(source, flags).test(node.getAttribute(attribute) ?? ""),
      )
    ) {
      found++;
    }
  }
  const matches = count === null ? found > 0 : found === count;
  return negate ? !matches : matches;
}

/** @noRailsEquivalent PERMANENT */
async function assertSelector(
  host: SystemTestHost,
  locator: unknown,
  options: TurboCableStreamSourceOptions,
  negate: boolean,
): Promise<void> {
  if (
    locator !== null &&
    typeof locator === "object" &&
    Object.getPrototypeOf(locator) === Object.prototype
  ) {
    options = locator as TurboCableStreamSourceOptions;
    locator = null;
  }
  const page = await host.page();
  await page.waitForFunction(isSatisfied, {
    ...turboCableStreamSource(locator, options),
    context: null,
    count: options.count ?? null,
    negate,
  });
}

export async function connectTurboCableStreamSources(
  this: SystemTestHost,
  options: TurboCableStreamSourceOptions = {},
  block: Block = null,
): Promise<void> {
  const page = await this.page();
  const { xpath } = turboCableStreamSource(null, { ...options, connected: false });
  for (const element of await page.locator(`xpath=${xpath}`).all()) {
    const context = await element.elementHandle();
    await page.waitForFunction(isSatisfied, {
      ...turboCableStreamSource(null, { ...options, connected: true }, "self::"),
      context,
      count: 1,
      negate: false,
    });
    if (block !== null && context !== null) block(context);
  }
}

export async function assertTurboCableStreamSource(
  this: SystemTestHost,
  locator: unknown = null,
  options: TurboCableStreamSourceOptions = {},
): Promise<void> {
  await assertSelector(this, locator, options, false);
}

export async function assertNoTurboCableStreamSource(
  this: SystemTestHost,
  locator: unknown = null,
  options: TurboCableStreamSourceOptions = {},
): Promise<void> {
  await assertSelector(this, locator, options, true);
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
      block(`${this.attribute()} = ${stringLiteral(this._value)}`);
      block(`${this.attribute()} = ${stringLiteral(this.signedStreamName(this._value))}`);
    } else if (Array.isArray(this._value) || rbObjRespondTo(this._value, "toKey")) {
      block(`${this.attribute()} = ${stringLiteral(this.signedStreamName(this._value))}`);
    } else if (isPresent(this._value)) {
      block(`${this.attribute()} = ${stringLiteral(String(this._value))}`);
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
Turbo.SystemTestHelper = SystemTestHelper;
