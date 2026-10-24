import { assertDifference, assertNoDifference } from "@blazetrails/activesupport";
import { MockRequest } from "@blazetrails/rack";
import { kernelThrow, rbModConstSet } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import "../test-helpers/test-helper.js";
import { ActionCable } from "../namespaces.js";
import { Base as ChannelBase } from "../channel/base.js";
import { TestServer } from "../test-helpers/stubs/test-server.js";
import { Base } from "./base.js";

type CallbackHost = {
  identifiedBy(...ids: string[]): void;
  beforeCommand(...m: unknown[]): void;
  aroundCommand(...m: unknown[]): void;
  afterCommand(...m: unknown[]): void;
};

class Connection extends Base {
  declare context: unknown;

  commandsCounter: number;

  constructor(...args: ConstructorParameters<typeof Base>) {
    super(...args);
    this.commandsCounter = 0;
  }

  /** @internal */
  private async setCurrentContext(block: () => unknown): Promise<void> {
    try {
      this.context = this.request.params["context"];
      await block();
    } finally {
      this.context = null;
    }
  }

  /** @internal */
  private incrementCommandsCounter(): void {
    this.commandsCounter += 1;
  }
}
const host = Connection as unknown as CallbackHost;
host.identifiedBy("context");
host.beforeCommand(function (this: Connection) {
  if (this.context != null) kernelThrow(":abort");
});
host.aroundCommand(":setCurrentContext");
host.afterCommand(":incrementCommandsCounter");

class ChatChannel extends ChannelBase {
  static wordsSpoken: unknown[] = [];
  static subscribedCount = 0;

  override subscribed(): void {
    ChatChannel.subscribedCount += 1;
  }

  speak(data: unknown): void {
    ChatChannel.wordsSpoken.push({
      data,
      context: (this as unknown as { context(): unknown }).context(),
    });
  }
}
const CallbacksTest = { name: "ActionCable::Connection::CallbacksTest", ChatChannel };
rbModConstSet(ActionCable.Connection, "CallbacksTest", CallbacksTest);
rbModConstSet(CallbacksTest, "ChatChannel", ChatChannel);

describe("ActionCable::Connection::CallbacksTest", () => {
  let server: TestServer;
  let env: Record<string, unknown>;
  let connection: Connection;
  let identifier: string;

  beforeEach(() => {
    server = new TestServer();
    env = MockRequest.envFor("/test", {
      HTTP_HOST: "localhost",
      HTTP_CONNECTION: "upgrade",
      HTTP_UPGRADE: "websocket",
    });
    connection = new Connection(server as never, env);
    identifier = JSON.stringify({ channel: "ActionCable::Connection::CallbacksTest::ChatChannel" });
  });

  it("before and after callbacks", async () => {
    const result = await assertDifference(
      () => ChatChannel.subscribedCount,
      +1,
      null,
      async () =>
        await assertDifference(
          () => connection.commandsCounter,
          +1,
          null,
          async () => await connection.handleChannelCommand({ identifier, command: "subscribe" }),
        ),
    );
    expect(result).toBeTruthy();
  });

  it("before callback halts", async () => {
    connection.context = "non_null";
    const result = await assertNoDifference(
      () => ChatChannel.subscribedCount,
      null,
      async () => await connection.handleChannelCommand({ identifier, command: "subscribe" }),
    );
    expect(result).toBeFalsy();
  });

  it("around_command callback", async () => {
    env["QUERY_STRING"] = "context=test";
    const connection = new Connection(server as never, env);

    await assertDifference(
      () => ChatChannel.wordsSpoken.length,
      +1,
      null,
      async () => {
        await connection.handleChannelCommand({ identifier, command: "subscribe" });
        await connection.handleChannelCommand({
          identifier,
          command: "message",
          data: JSON.stringify({ action: "speak", message: "hello" }),
        });
      },
    );

    const message = ChatChannel.wordsSpoken.at(-1);
    expect(message).toEqual({ data: { action: "speak", message: "hello" }, context: "test" });
  });
});
