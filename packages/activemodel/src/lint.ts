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

    withPatchedPersistedFalse(m, () => {
      if (m.toKey() !== null) {
        throw new Error("toKey should return null when `isPersisted` returns false");
      }
    });
  }

  type ToParamHost = {
    toParam(): string | null;
    toKey(): unknown[] | null;
    isPersisted(): boolean;
  };
  export function testToParam(input: ToParamHost | { toModel(): ToParamHost }): void {
    const m = model(input);
    const param = m.toParam();
    if (param !== null && typeof param !== "string") {
      throw new Error("toParam must return null or a string");
    }

    withPatched(
      m,
      "toKey",
      () => [1],
      () => {
        withPatchedPersistedFalse(m, () => {
          if (m.toParam() !== null) {
            throw new Error("toParam should return null when `isPersisted` returns false");
          }
        });
      },
    );
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

  type ModelNamingHost = {
    modelName: { human: string; singular: string; plural: string };
    constructor: { modelName?: { human: string; singular: string; plural: string } };
  };
  export function testModelNaming(model: ModelNamingHost): void {
    const classModelName = model.constructor.modelName;
    if (!classModelName) {
      throw new Error("model.constructor.modelName must be defined");
    }
    if (typeof classModelName.human !== "string") {
      throw new Error("modelName.human must return a string");
    }
    if (typeof classModelName.singular !== "string") {
      throw new Error("modelName.singular must return a string");
    }
    if (typeof classModelName.plural !== "string") {
      throw new Error("modelName.plural must return a string");
    }
    if (model.modelName !== classModelName) {
      throw new Error("model.modelName must equal model.constructor.modelName");
    }
  }

  /**
   * Trails uses `errors.get(name)` rather than Ruby's `errors[:name]`
   * array-access syntax. Behavior matches Rails: must return an array
   * (empty when no errors are present for the attribute).
   */
  export function testErrorsAref(model: { errors: { get(attribute: string): string[] } }): void {
    const result = model.errors.get("attribute");
    if (!Array.isArray(result)) {
      throw new Error("errors.get(attribute) must return an array");
    }
  }
}

/**
 * Temporarily replace a method on `target` with `fn` for the duration of `body`.
 * Restores the original property descriptor in a `finally`.
 *
 * @internal Rails-private helper — mirrors `def model.foo() ... end` patches in lint.rb.
 */
function withPatched<T extends object, K extends keyof T>(
  target: T,
  key: K,
  fn: T[K],
  body: () => void,
): void {
  const original = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, {
    value: fn,
    configurable: true,
    writable: true,
  });
  try {
    body();
  } finally {
    if (original) {
      Object.defineProperty(target, key, original);
    } else {
      delete (target as Record<PropertyKey, unknown>)[key as PropertyKey];
    }
  }
}

/** @internal Rails-private helper. */
function withPatchedPersistedFalse(target: { isPersisted(): boolean }, body: () => void): void {
  withPatched(target, "isPersisted", () => false, body);
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
