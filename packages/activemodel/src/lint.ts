// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Lint {}

/** @noRailsEquivalent PERMANENT */
export class MinitestAssertion extends globalThis.Error {
  constructor(message: string) {
    super(message);
    this.name = "MinitestAssertion";
  }
}

/** @internal */
export function model<T>(m: T | { toModel(): T }): T {
  if (m && typeof (m as { toModel?: unknown }).toModel === "function") {
    return (m as { toModel(): T }).toModel();
  }
  return m as T;
}

/** @internal */
export function assertBoolean(result: unknown, name: string): void {
  if (result !== true && result !== false) {
    throw new MinitestAssertion(`${name} should be a boolean`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Tests {
  type ToKeyHost = { toKey(): unknown[] | null; isPersisted(): boolean };
  export function testToKey(input: ToKeyHost | { toModel(): ToKeyHost }): void {
    const m = model(input);
    if (typeof m.toKey !== "function") {
      throw new MinitestAssertion("model must respond to toKey");
    }
    m.isPersisted = () => false;
    if (m.toKey() !== null) {
      throw new MinitestAssertion("toKey should return null when `isPersisted` returns false");
    }
  }

  type ToParamHost = {
    toParam(): string | null;
    toKey(): unknown[] | null;
    isPersisted(): boolean;
  };
  export function testToParam(input: ToParamHost | { toModel(): ToParamHost }): void {
    const m = model(input);
    if (typeof m.toParam !== "function") {
      throw new MinitestAssertion("model must respond to toParam");
    }
    m.toKey = () => [1];
    m.isPersisted = () => false;
    if (m.toParam() !== null) {
      throw new MinitestAssertion("toParam should return null when `isPersisted` returns false");
    }
  }

  type ToPartialPathHost = { toPartialPath(): string };
  export function testToPartialPath(
    input: ToPartialPathHost | { toModel(): ToPartialPathHost },
  ): void {
    const m = model(input);
    if (typeof m.toPartialPath !== "function") {
      throw new MinitestAssertion("model must respond to toPartialPath");
    }
    if (typeof m.toPartialPath() !== "string") {
      throw new MinitestAssertion("toPartialPath must return a string");
    }
  }

  type PersistedHost = { isPersisted(): boolean };
  export function testPersisted(input: PersistedHost | { toModel(): PersistedHost }): void {
    const m = model(input);
    if (typeof m.isPersisted !== "function") {
      throw new MinitestAssertion("model must respond to isPersisted");
    }
    assertBoolean(m.isPersisted(), "isPersisted");
  }

  type ModelNamingHost = {
    modelName: { human: () => string; singular: string; plural: string };
    constructor: { modelName?: { human: () => string; singular: string; plural: string } };
  };
  export function testModelNaming(model: ModelNamingHost): void {
    const modelName = model.constructor.modelName;
    if (!modelName) {
      throw new MinitestAssertion("model.constructor.modelName must be defined");
    }
    if (typeof modelName.human() !== "string") {
      throw new MinitestAssertion("modelName.human must return a string");
    }
    if (typeof modelName.singular !== "string") {
      throw new MinitestAssertion("modelName.singular must return a string");
    }
    if (typeof modelName.plural !== "string") {
      throw new MinitestAssertion("modelName.plural must return a string");
    }
    if (model.modelName !== modelName) {
      throw new MinitestAssertion("model.modelName must equal model.constructor.modelName");
    }
  }

  export function testErrorsAref(model: {
    errors: { messagesFor(attribute: string): string[] };
  }): void {
    const result = model.errors.messagesFor("hello");
    if (!Array.isArray(result) || result.length !== 0) {
      throw new MinitestAssertion("errors#[] should return an empty Array");
    }
  }
}

export const {
  testToKey,
  testToParam,
  testToPartialPath,
  testPersisted,
  testModelNaming,
  testErrorsAref,
} = Tests;
