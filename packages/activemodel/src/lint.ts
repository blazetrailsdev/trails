import { assert, assertEqual, assertKindOf, assertRespondTo } from "@blazetrails/activesupport";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Lint {}

/** @internal */
export function model<T>(model: { toModel(): T }): T {
  assertRespondTo(model, "toModel");
  return model.toModel();
}

/** @internal */
export function assertBoolean(result: unknown, name: string): void {
  assert(result === true || result === false, `${name} should be a boolean`);
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Tests {
  type ToKeyHost = { toKey(): unknown[] | null; isPersisted(): boolean };
  export function testToKey(input: { toModel(): ToKeyHost }): void {
    assertRespondTo(model(input), "toKey");
    model(input).isPersisted = () => false;
    assert(
      model(input).toKey() == null,
      "to_key should return nil when `persisted?` returns false",
    );
  }

  type ToParamHost = {
    toParam(): string | null;
    toKey(): unknown[] | null;
    isPersisted(): boolean;
  };
  export function testToParam(input: { toModel(): ToParamHost }): void {
    assertRespondTo(model(input), "toParam");
    model(input).toKey = () => [1];
    model(input).isPersisted = () => false;
    assert(
      model(input).toParam() == null,
      "to_param should return nil when `persisted?` returns false",
    );
  }

  type ToPartialPathHost = { toPartialPath(): string };
  export function testToPartialPath(input: { toModel(): ToPartialPathHost }): void {
    assertRespondTo(model(input), "toPartialPath");
    assertKindOf(String, model(input).toPartialPath());
  }

  type PersistedHost = { isPersisted(): boolean };
  export function testPersisted(input: { toModel(): PersistedHost }): void {
    assertRespondTo(model(input), "isPersisted");
    assertBoolean(model(input).isPersisted(), "persisted?");
  }

  type ModelName = { human(): string; singular: string; plural: string };
  type ModelNamingHost = { modelName: ModelName; constructor: { modelName?: ModelName } };
  export function testModelNaming(input: { toModel(): ModelNamingHost }): void {
    assertRespondTo(model(input).constructor, "modelName");
    const modelName = model(input).constructor.modelName!;
    assertRespondTo(modelName, "toString");
    assertRespondTo(modelName.human(), "toStr");
    assertRespondTo(modelName.singular, "toStr");
    assertRespondTo(modelName.plural, "toStr");

    assertRespondTo(model(input), "modelName");
    assertEqual(model(input).modelName, model(input).constructor.modelName);
  }

  type ErrorsArefHost = { errors: { get(attribute: string): unknown } };
  export function testErrorsAref(input: { toModel(): ErrorsArefHost }): void {
    assertRespondTo(model(input), "errors");
    assertEqual([], model(input).errors.get("hello"), "errors#[] should return an empty Array");
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
