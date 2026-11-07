import { beforeEach, describe, expect, it } from "vitest";
import { b, Encoding, rbObjEncoding, RFC2396_PARSER } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";
import "../../test-helpers/abstract-unit.js";

class ParameterEncodingController extends Base {
  async testUndeclaredParameter(): Promise<void> {
    await this.render({ body: rbObjEncoding(this.params.get("foo") as string).toString() });
  }

  static {
    this.skipParameterEncoding("testSkipParameterEncoding");
  }
  async testSkipParameterEncoding(): Promise<void> {
    await this.render({ body: rbObjEncoding(this.params.get("bar") as string).toString() });
  }

  static {
    this.paramEncoding("testParamEncoding", "baz", Encoding.SHIFT_JIS);
  }
  async testParamEncoding(): Promise<void> {
    await this.render({
      body: JSON.stringify({
        baz: rbObjEncoding(this.params.get("baz") as string).toString(),
        qux: rbObjEncoding(this.params.get("qux") as string).toString(),
      }),
    });
  }

  static {
    this.skipParameterEncoding("testAllValuesEncoding");
  }
  async testAllValuesEncoding(): Promise<void> {
    await this.render({
      body: JSON.stringify(
        this.params
          .except("action", "controller")
          .values.map((v) => rbObjEncoding(v as string))
          .map((e) => e.name),
      ),
    });
  }
}

describe("ParameterEncodingTest", () => {
  let tc: TestCase;
  const assertResponse = (type: number | string): void => tc.assertResponse(type);

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new ParameterEncodingController();
    await tc.beforeSetup();
  });

  it("properly transcodes undeclared parameters into UTF-8 encodings", async () => {
    await tc.post("testUndeclaredParameter", { params: { foo: "foo" } });

    assertResponse("success");
    expect(tc.response.body).toBe("UTF-8");
  });

  it("properly transcodes parameters of the action specified by skip_parameter_encoding to ASCII_8BIT", async () => {
    await tc.post("testSkipParameterEncoding", { params: { bar: "bar" } });

    assertResponse("success");
  });

  it("properly transcodes declared parameters into specified encodings", async () => {
    await tc.post("testParamEncoding", { params: { baz: "baz", qux: "qux" } });

    assertResponse("success");
    expect(JSON.parse(tc.response.body)["qux"]).toBe("UTF-8");
  });

  it("properly encodes all ASCII_8BIT parameters into binary", async () => {
    await tc.post("testAllValuesEncoding", { params: { foo: "foo", bar: "bar", baz: "baz" } });

    assertResponse("success");
  });

  it("does not raise an error when passed a param declared as ASCII-8BIT that contains invalid bytes", async () => {
    await tc.get("testSkipParameterEncoding", {
      params: { bar: RFC2396_PARSER.escape(b("bar\xE2baz")) },
    });

    assertResponse("success");
  });
});
