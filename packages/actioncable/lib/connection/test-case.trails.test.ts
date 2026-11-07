import { describe, expect, it } from "vitest";
import { onLoad } from "@blazetrails/activesupport";
import "../test-helpers/test-helper.js";
import { ActionCable } from "../namespaces.js";
import { Base } from "./base.js";
import { TestCase } from "./test-case.js";

let constructed = 0;
class CountingConnection extends Base {
  constructor(...args: ConstructorParameters<typeof Base>) {
    super(...args);
    constructed++;
  }
}

describe("ActionCable::Connection::TestCase", () => {
  it("connect never runs Connection::Base#initialize", async () => {
    class CountingConnectionTest extends TestCase {}
    CountingConnectionTest.tests(CountingConnection);
    const tc = new CountingConnectionTest("testNothing" as never);

    const connection = await tc.connect("/cable?a=1", { headers: { "X-Foo": "bar" } });
    expect(constructed).toBe(0);
    expect(connection).toBeInstanceOf(CountingConnection);
    const request = (
      connection as unknown as {
        request: { params: unknown; headers: { get(k: string): unknown } };
      }
    ).request;
    expect(request.params).toMatchObject({ a: "1" });
    expect(request.headers.get("X-Foo")).toBe("bar");

    await tc.disconnect();
    expect(tc.connection).toBeNull();
  });

  it("runs the action_cable_connection_test_case load hooks with the class", () => {
    let base: unknown;
    onLoad("action_cable_connection_test_case", (klass: unknown) => {
      base = klass;
    });
    expect(base).toBe(TestCase);
    expect(ActionCable.Connection.TestCase).toBe(TestCase);
  });
});
