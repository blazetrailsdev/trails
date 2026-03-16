import { describe, it } from "vitest";

describe("RenderTest", () => {
  it.skip("render with blank", () => {});
  it.skip("rendering more than once raises an exception", () => {});
});

describe("TestOnlyRenderPublicActions", () => {
  it.skip("raises an exception when a method of Object is called", () => {});
  it.skip("raises an exception when a private method is called", () => {});
});

describe("TestVariousObjectsAvailableInView", () => {
  it.skip("The request object is accessible in the view", () => {});
  it.skip("The action_name is accessible in the view", () => {});
  it.skip("The controller_name is accessible in the view", () => {});
});

describe("TestViewInheritance", () => {
  it.skip("Template from child controller gets picked over parent one", () => {});
  it.skip("Template from child controller with custom view_paths prepended gets picked over parent one", () => {});
  it.skip("Template from child controller with custom view_paths appended gets picked over parent one", () => {});
  it.skip("Template from parent controller gets picked if missing in child controller", () => {});
});
