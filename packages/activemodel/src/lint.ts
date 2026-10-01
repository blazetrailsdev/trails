import { Assertion } from "@blazetrails/activesupport";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Lint {}

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
    throw new Assertion(`${name} should be a boolean`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Tests {
  type ToKeyHost = { toKey(): unknown[] | null; isPersisted(): boolean };
  export function testToKey(input: ToKeyHost | { toModel(): ToKeyHost }): void {
    const m = model(input);
    if (typeof m.toKey !== "function") {
      throw new Assertion("model must respond to toKey");
    }
    m.isPersisted = () => false;
    if (m.toKey() !== null) {
      throw new Assertion("toKey should return null when `isPersisted` returns false");
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
      throw new Assertion("model must respond to toParam");
    }
    m.toKey = () => [1];
    m.isPersisted = () => false;
    if (m.toParam() !== null) {
      throw new Assertion("toParam should return null when `isPersisted` returns false");
    }
  }

  type ToPartialPathHost = { toPartialPath(): string };
  export function testToPartialPath(
    input: ToPartialPathHost | { toModel(): ToPartialPathHost },
  ): void {
    const m = model(input);
    if (typeof m.toPartialPath !== "function") {
      throw new Assertion("model must respond to toPartialPath");
    }
    if (typeof m.toPartialPath() !== "string") {
      throw new Assertion("toPartialPath must return a string");
    }
  }

  type PersistedHost = { isPersisted(): boolean };
  export function testPersisted(input: PersistedHost | { toModel(): PersistedHost }): void {
    const m = model(input);
    if (typeof m.isPersisted !== "function") {
      throw new Assertion("model must respond to isPersisted");
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
      throw new Assertion("model.constructor.modelName must be defined");
    }
    if (typeof modelName.human() !== "string") {
      throw new Assertion("modelName.human must return a string");
    }
    if (typeof modelName.singular !== "string") {
      throw new Assertion("modelName.singular must return a string");
    }
    if (typeof modelName.plural !== "string") {
      throw new Assertion("modelName.plural must return a string");
    }
    if (model.modelName !== modelName) {
      throw new Assertion("model.modelName must equal model.constructor.modelName");
    }
  }

  export function testErrorsAref(model: {
    errors: { messagesFor(attribute: string): string[] };
  }): void {
    const result = model.errors.messagesFor("hello");
    if (!Array.isArray(result) || result.length !== 0) {
      throw new Assertion("errors#[] should return an empty Array");
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
