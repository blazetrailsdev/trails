import { beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/actioncable/connection/test-case";
import { fixture, loadFixtures } from "../../test-helper.ts";
import { Connection } from "../../../app/channels/application-cable/connection.ts";
import type { User } from "../../../app/models/user.ts";

class ConnectionTest extends TestCase {
  test(): void {}
}
ConnectionTest.tests(Connection);

describe("ApplicationCable::ConnectionTest", () => {
  let t: ConnectionTest;
  const users = (label: string) => fixture<User>("users", label);

  beforeEach(async () => {
    await loadFixtures();
    t = new ConnectionTest("test");
  });

  it("connects with cookies", async () => {
    const session = await (
      await users("kevin")
    ).sessions.startBang({
      userAgent: "test",
      ipAddress: "10.0.0.1",
    });
    t.cookies().signed.set("session_token", session.token);

    await t.connect();

    expect(((t.connection as Connection).currentUser as User).id).toBe((await users("kevin")).id);
  });

  it("rejects connection without cookies", async () => {
    await t.assertRejectConnection(() => t.connect());
  });
});
