import { describe, it } from "vitest";

describe("BareTest", () => {
  it.skip("response body is a Rack-compatible response", () => {});
  it.skip("response_body value is wrapped in an array when the value is a String", () => {});
  it.skip("can assign response array as part of the controller execution", () => {});
  it.skip("can assign response object as part of the controller execution", () => {});
  it.skip("can assign response body streamable object as part of the controller execution", () => {});
  it.skip("connect a request to controller instance without dispatch", () => {});
});

describe("BareEmptyTest", () => {
  it.skip("response body is nil", () => {});
});

describe("HeadTest", () => {
  it.skip("head works on its own", () => {});
  it.skip("head :continue (100) does not return a content-type header", () => {});
  it.skip("head :switching_protocols (101) does not return a content-type header", () => {});
  it.skip("head :processing (102) does not return a content-type header", () => {});
  it.skip("head :early_hints (103) does not return a content-type header", () => {});
  it.skip("head :no_content (204) does not return a content-type header", () => {});
  it.skip("head :reset_content (205) does not return a content-type header", () => {});
  it.skip("head :not_modified (304) does not return a content-type header", () => {});
  it.skip("head :no_content (204) does not return any content", () => {});
  it.skip("head :reset_content (205) does not return any content", () => {});
  it.skip("head :not_modified (304) does not return any content", () => {});
  it.skip("head :continue (100) does not return any content", () => {});
  it.skip("head :switching_protocols (101) does not return any content", () => {});
  it.skip("head :processing (102) does not return any content", () => {});
});

describe("BareControllerTest", () => {
  it.skip("GET index", () => {});
});
