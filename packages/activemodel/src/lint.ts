/**
 * Lint — compliance tests for ActiveModel-compatible objects.
 *
 * Mirrors: ActiveModel::Lint and ActiveModel::Lint::Tests
 *
 * In Rails, Lint::Tests is a module you include into your test class
 * to verify that an object complies with the ActiveModel interface.
 * Here we provide standalone assertion functions that do the same.
 */

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Lint {}

/**
 * Resolve the model fixture under test. Mirrors Rails
 * `Lint::Tests#model` (activemodel/lib/active_model/lint.rb:108-111)
 * which calls `@model.to_model` so the fixture can stand in via
 * Conversion.
 *
 * @internal Rails-private helper.
 */
export function model<T>(m: T | { toModel(): T }): T {
  if (m && typeof (m as { toModel?: unknown }).toModel === "function") {
    return (m as { toModel(): T }).toModel();
  }
  return m as T;
}

/**
 * Assert a value is a strict boolean. Mirrors Rails
 * `Lint::Tests#assert_boolean` (activemodel/lib/active_model/lint.rb:113-115).
 *
 * @internal Rails-private helper.
 */
export function assertBoolean(result: unknown, name: string): void {
  if (result !== true && result !== false) {
    throw new Error(`${name} should be a boolean`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Tests {
  type ToKeyHost = { toKey(): unknown[] | null; isPersisted(): boolean };
  export function testToKey(input: ToKeyHost | { toModel(): ToKeyHost }): void {
    const m = model(input);
    const key = m.toKey();
    if (key !== null && !Array.isArray(key)) {
      throw new Error("toKey must return null or an array");
    }

    const persisted = m.isPersisted();
    assertBoolean(persisted, "isPersisted");

    if (persisted && key === null) {
      throw new Error("toKey must not return null when the model is persisted");
    }
  }

  type ToParamHost = { toParam(): string | null; toKey(): unknown[] | null };
  export function testToParam(input: ToParamHost | { toModel(): ToParamHost }): void {
    const m = model(input);
    const param = m.toParam();
    if (param !== null && typeof param !== "string") {
      throw new Error("toParam must return null or a string");
    }
  }

  type ToPartialPathHost = { toPartialPath(): string };
  export function testToPartialPath(
    input: ToPartialPathHost | { toModel(): ToPartialPathHost },
  ): void {
    const m = model(input);
    const path = m.toPartialPath();
    if (typeof path !== "string") {
      throw new Error("toPartialPath must return a string");
    }
  }

  type PersistedHost = { isPersisted(): boolean };
  export function testPersisted(input: PersistedHost | { toModel(): PersistedHost }): void {
    assertBoolean(model(input).isPersisted(), "isPersisted");
  }

  export function testErrors(model: { errors: { fullMessages: unknown[] } }): void {
    const messages = model.errors.fullMessages;
    if (!Array.isArray(messages)) {
      throw new Error("errors.fullMessages must return an array");
    }
  }

  export function testModelNaming(model: {
    constructor: { modelName?: { human: string; singular: string; plural: string } };
  }): void {
    const modelName = model.constructor.modelName;
    if (!modelName) {
      throw new Error("model.constructor.modelName must be defined");
    }
    if (typeof modelName.human !== "string") {
      throw new Error("modelName.human must return a string");
    }
    if (typeof modelName.singular !== "string") {
      throw new Error("modelName.singular must return a string");
    }
    if (typeof modelName.plural !== "string") {
      throw new Error("modelName.plural must return a string");
    }
  }

  export function testErrorsAref(model: { errors: { get(attribute: string): string[] } }): void {
    const result = model.errors.get("attribute");
    if (!Array.isArray(result)) {
      throw new Error("errors.get(attribute) must return an array");
    }
  }
}

export const {
  testToKey,
  testToParam,
  testToPartialPath,
  testPersisted,
  testErrors,
  testModelNaming,
  testErrorsAref,
} = Tests;
