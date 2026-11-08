import { beforeEach, describe, it } from "vitest";
import "../../lib/index.js";
import { TestCase } from "../support/test-helper.js";
import { Base } from "../../lib/server/base.js";

describe("BaseTest", () => {
  let tc: TestCase;
  let server: Base;

  beforeEach(async () => {
    tc = new TestCase("base");
    server = new Base();
    server.config.cable = { adapter: "async" };
    await server.config.loadPubsubAdapter();
  });

  class FakeConnection {
    process(): void {}

    close(): void {}
  }

  it("#restart closes all open connections", async () => {
    const conn = new FakeConnection();
    server.addConnection(conn);

    await tc.assertCalled(conn, "close", null, {}, async () => {
      await server.restart();
    });
  });

  it("#restart shuts down worker pool", async () => {
    await tc.assertCalled(server.workerPool, "halt", null, {}, async () => {
      await server.restart();
    });
  });

  it("#restart shuts down pub/sub adapter", async () => {
    await tc.assertCalled(server.pubsub, "shutdown", null, {}, async () => {
      await server.restart();
    });
  });
});
