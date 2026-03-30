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

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Tests {
  export function testToKey(model: { toKey(): unknown[] | null; isPersisted(): boolean }): void {
    const key = model.toKey();
    if (key !== null && !Array.isArray(key)) {
      throw new Error("toKey must return null or an array");
    }

    const persisted = model.isPersisted();
    if (typeof persisted !== "boolean") {
      throw new Error("isPersisted must return a boolean");
    }

    if (persisted && key === null) {
      throw new Error("toKey must not return null when the model is persisted");
    }
  }

  export function testToParam(model: {
    toParam(): string | null;
    toKey(): unknown[] | null;
  }): void {
    const param = model.toParam();
    if (param !== null && typeof param !== "string") {
      throw new Error("toParam must return null or a string");
    }
  }

  export function testToPartialPath(model: { toPartialPath(): string }): void {
    const path = model.toPartialPath();
    if (typeof path !== "string") {
      throw new Error("toPartialPath must return a string");
    }
  }

  export function testPersisted(model: { isPersisted(): boolean }): void {
    const result = model.isPersisted();
    if (typeof result !== "boolean") {
      throw new Error("isPersisted must return a boolean");
    }
  }

  export function testErrors(model: { errors: { fullMessages: unknown[] } }): void {
    const messages = model.errors.fullMessages;
    if (!Array.isArray(messages)) {
      throw new Error("errors.fullMessages must return an array");
    }
  }
}

export const { testToKey, testToParam, testToPartialPath, testPersisted, testErrors } = Tests;
