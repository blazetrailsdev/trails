import { describe, expect, it } from "vitest";
import { rbModName } from "@blazetrails/ruby-compat";
import "./index.js";
import { ActionDispatch } from "./namespaces.js";
import { IntegrationTest } from "./action-dispatch/testing/integration.js";
import { TestRequest } from "./action-dispatch/testing/test-request.js";
import { AssertionResponse } from "./action-dispatch/testing/assertion-response.js";

describe("ActionDispatch autoload_under testing", () => {
  it("seats IntegrationTest, TestRequest and AssertionResponse at their Ruby paths", () => {
    expect(ActionDispatch.IntegrationTest).toBe(IntegrationTest);
    expect(ActionDispatch.TestRequest).toBe(TestRequest);
    expect(ActionDispatch.AssertionResponse).toBe(AssertionResponse);
    expect(rbModName(IntegrationTest)).toBe("ActionDispatch::IntegrationTest");
    expect(rbModName(TestRequest)).toBe("ActionDispatch::TestRequest");
    expect(rbModName(AssertionResponse)).toBe("ActionDispatch::AssertionResponse");
  });
});
