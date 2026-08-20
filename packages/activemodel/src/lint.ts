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
 * Raised when an ActiveModel::Lint compliance check fails.
 *
 * Rails' `Lint::Tests` are Minitest test methods whose `assert*` calls raise
 * `Minitest::Assertion` on failure (there is no ActiveModel error class for
 * these — the failures are test-framework assertions). This ports that
 * assertion-failure identity so the standalone lint functions surface a single
 * named class instead of a bare `Error`.
 *
 * @noRailsEquivalent Minitest's assertion-failure class, not an ActiveModel one:
 * `lint.rb`'s tests are Minitest test methods and raise `Minitest::Assertion`,
 * which trails has no port of. Named for the Ruby class it stands in for.
 */
export class MinitestAssertion extends globalThis.Error {
  constructor(message: string) {
    super(message);
    this.name = "MinitestAssertion";
  }
}

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
    throw new MinitestAssertion(`${name} should be a boolean`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Tests {
  type ToKeyHost = { toKey(): unknown[] | null; isPersisted(): boolean };
  /** Mirrors `Lint::Tests#test_to_key` (lint.rb:31-35). */
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
  /** Mirrors `Lint::Tests#test_to_param` (lint.rb:46-51). */
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
  /** Mirrors `Lint::Tests#test_to_partial_path` (lint.rb:58-61). */
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
  /** Mirrors `Lint::Tests#test_persisted?` (lint.rb:70-73). */
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
  /** Mirrors `Lint::Tests#test_model_naming` (lint.rb:81-91). */
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

  /**
   * Mirrors `Lint::Tests#test_errors_aref` (lint.rb:102-105). Ruby's
   * `errors[:hello]` is `Errors#[]`, an operator with no TS spelling; the
   * method it forwards to (`messages_for`, errors.rb:229-231) is the port's
   * name for it.
   */
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
