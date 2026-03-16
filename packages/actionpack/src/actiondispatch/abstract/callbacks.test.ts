import { describe, it } from "vitest";

describe("TestCallbacks1", () => {
  it.skip("basic callbacks work", () => {});
});

describe("TestCallbacks2", () => {
  it.skip("before_action works", () => {});
  it.skip("after_action works", () => {});
  it.skip("around_action works", () => {});
  it.skip("before_action with overwritten condition", () => {});
});

describe("TestCallbacks3", () => {
  it.skip("before_action works with procs", () => {});
  it.skip("after_action works with procs", () => {});
});

describe("TestCallbacksWithConditions", () => {
  it.skip("when :only is specified, a before action is triggered on that action", () => {});
  it.skip("when :only is specified, a before action is not triggered on other actions", () => {});
  it.skip("when :except is specified, an after action is not triggered on that action", () => {});
});

describe("TestCallbacksWithReusedConditions", () => {
  it.skip("when :only is specified, both actions triggered on that action", () => {});
  it.skip("when :only is specified, both actions are not triggered on other actions", () => {});
});

describe("TestCallbacksWithArrayConditions", () => {
  it.skip("when :only is specified with an array, a before action is triggered on that action", () => {});
  it.skip("when :only is specified with an array, a before action is not triggered on other actions", () => {});
  it.skip("when :except is specified with an array, an after action is not triggered on that action", () => {});
});

describe("TestCallbacksWithChangedConditions", () => {
  it.skip("when a callback is modified in a child with :only, it works for the :only action", () => {});
  it.skip("when a callback is modified in a child with :only, it does not work for other actions", () => {});
});

describe("TestHalting", () => {
  it.skip("when a callback sets the response body, the action should not be invoked", () => {});
});

describe("TestCallbacksWithArgs", () => {
  it.skip("callbacks still work when invoking process with multiple arguments", () => {});
});

describe("TestCallbacksWithMissingConditions", () => {
  it.skip("callbacks raise exception when their 'only' condition is a missing action", () => {});
  it.skip("callbacks raise exception when their 'only' array condition contains a missing action", () => {});
  it.skip("callbacks raise exception when their 'except' condition is a missing action", () => {});
  it.skip("callbacks raise exception when their 'except' array condition contains a missing action", () => {});
  it.skip("raised exception message includes the names of callback actions and missing conditional action", () => {});
  it.skip("raised exception message includes a block callback", () => {});
  it.skip("callbacks with both :only and :except options raise an exception with the correct message", () => {});
});
