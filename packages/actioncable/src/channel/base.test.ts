import { Logger, Notifications, type NotificationEvent, stub } from "@blazetrails/activesupport";
import {
  StandardError,
  StringIO,
  rbInspect,
  rbModConstSet,
  rbObjIvarGet,
  rbObjIvarSet,
} from "@blazetrails/ruby-compat";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../test-helpers/test-helper.js";
import { ActionCable } from "../namespaces.js";
import { Room } from "../test-helpers/stubs/room.js";
import { TestConnection } from "../test-helpers/stubs/test-connection.js";
import { User } from "../test-helpers/stubs/user.js";
import { Base } from "./base.js";

type Data = Record<string, unknown>;

interface ChannelHost {
  methodAdded(name: string): void;
}

class BasicChannel extends Base {
  declare _lastAction: unknown[] | undefined;

  chatters(): void {
    this._lastAction = ["chatters"];
  }
}

class SomeCustomError extends StandardError {}

class ChatChannel extends BasicChannel {
  declare _room: Room | null | undefined;
  declare _actions: unknown[];
  declare _subscribed: boolean;

  get room(): Room | null | undefined {
    return this._room;
  }

  get lastAction(): unknown[] | undefined {
    return this._lastAction;
  }

  static {
    this.afterSubscribe(":toggleSubscribed");
    this.afterUnsubscribe(":toggleSubscribed");
    this.rescueFrom(SomeCustomError, { with: ":errorHandler" });
  }

  constructor(connection: TestConnection, identifier: string, params: Data = {}) {
    super(connection as never, identifier, params);
    this._subscribed = false;
  }

  override subscribed(): unknown[] {
    this._room = new Room(this.params["id"]);
    return (this._actions = []);
  }

  override unsubscribed(): null {
    return (this._room = null);
  }

  toggleSubscribed(): boolean {
    return (this._subscribed = !this._subscribed);
  }

  leave(): void {
    this._lastAction = ["leave"];
  }

  speak(data: Data): void {
    this._lastAction = ["speak", data];
  }

  topic(data: Data): void {
    this._lastAction = ["topic", data];
  }

  isSubscribed(): boolean {
    return this._subscribed;
  }

  getLatest(): unknown {
    return this.transmit({ data: "latest" });
  }

  receive(): void {
    this._lastAction = ["receive"];
  }

  errorAction(): never {
    throw new SomeCustomError();
  }

  /** @internal */
  private rmRf(): void {
    this._lastAction = ["rm_rf"];
  }

  /** @internal */
  private errorHandler(): void {
    this._lastAction = ["error_action"];
  }
}

const BaseTest = { name: "ActionCable::Channel::BaseTest" };
rbModConstSet(ActionCable.Channel, "BaseTest", BaseTest);
rbModConstSet(BaseTest, "ChatChannel", ChatChannel);

describe("ActionCable::Channel::BaseTest", () => {
  let user: User;
  let connection: TestConnection;
  let channel: ChatChannel;

  beforeAll(() => {
    const proto = Base.prototype as unknown as Record<string, unknown>;
    proto.kick = function (this: BasicChannel) {
      this._lastAction = ["kick"];
    };
    proto.topic = function () {};
    (Base as unknown as ChannelHost).methodAdded("kick");
    (Base as unknown as ChannelHost).methodAdded("topic");
  });

  afterAll(() => {
    const proto = Base.prototype as unknown as Record<string, unknown>;
    delete proto.kick;
    delete proto.topic;
    (Base as unknown as ChannelHost).methodAdded("kick");
    (Base as unknown as ChannelHost).methodAdded("topic");
  });

  beforeEach(() => {
    user = new User("lifo");
    connection = new TestConnection(user);
    channel = new ChatChannel(connection, "{id: 1}", { id: 1 });
  });

  async function assertLogged(message: string, block: () => unknown): Promise<void> {
    const oldLogger = rbObjIvarGet(connection, "@logger");
    const log = new StringIO();
    rbObjIvarSet(connection, "@logger", new Logger(log));

    try {
      await block();

      log.rewind();
      expect(log.read()).toContain(message);
    } finally {
      rbObjIvarSet(connection, "@logger", oldLogger);
    }
  }

  it("should subscribe to a channel", async () => {
    await channel.subscribeToChannel();
    expect(channel.room!.id).toBe(1);
  });

  it("on subscribe callbacks", async () => {
    await channel.subscribeToChannel();
    expect(channel.subscribed()).toBeRubyTruthy();
  });

  it("channel params", () => {
    expect(channel.params).toEqual({ id: 1 });
  });

  it("does not log filtered parameters", async () => {
    connection.server.config.filterParameters.push("password");
    const data = { password: "password", foo: "foo" };

    await assertLogged(rbInspect({ password: "[FILTERED]" }).slice(1, -1), () =>
      channel.performAction(data),
    );
  });

  it("unsubscribing from a channel", async () => {
    await channel.subscribeToChannel();

    expect(channel.room).toBeTruthy();
    expect(channel.isSubscribed()).toBeTruthy();

    await channel.unsubscribeFromChannel();

    expect(channel.room).toBeFalsy();
    expect(channel.isSubscribed()).toBeFalsy();
  });

  it("connection identifiers", () => {
    expect((channel as unknown as { currentUser(): User }).currentUser().name).toBe(user.name);
  });

  it("callable action without any argument", async () => {
    await channel.performAction({ action: "leave" });
    expect(channel.lastAction).toEqual(["leave"]);
  });

  it("callable action with arguments", async () => {
    const data = { action: "speak", content: "Hello World" };

    await channel.performAction(data);
    expect(channel.lastAction).toEqual(["speak", data]);
  });

  // PERMANENT-SKIP: CLAUDE.md, "Method visibility is compile-time only (`Module#private`, `basic_obj_respond_to`'s `pub`)" — a private `rm_rf` is still a public instance method, so it is dispatched.
  it.skip("should not dispatch a private method", async () => {
    await channel.performAction({ action: "rmRf" });
    expect(channel.lastAction).toBeUndefined();
  });

  it("should not dispatch a public method defined on Base", async () => {
    await channel.performAction({ action: "kick" });
    expect(channel.lastAction).toBeUndefined();
  });

  it("should dispatch a public method defined on Base and redefined on channel", async () => {
    const data = { action: "topic", content: "This is Sparta!" };

    await channel.performAction(data);
    expect(channel.lastAction).toEqual(["topic", data]);
  });

  it("should dispatch calling a public method defined in an ancestor", async () => {
    await channel.performAction({ action: "chatters" });
    expect(channel.lastAction).toEqual(["chatters"]);
  });

  it("should dispatch receive action when perform_action is called with empty action", async () => {
    const data = { content: "hello" };
    await channel.performAction(data);
    expect(channel.lastAction).toEqual(["receive"]);
  });

  it("transmitting data", async () => {
    await channel.performAction({ action: "getLatest" });

    const expected = { identifier: "{id: 1}", message: { data: "latest" } };
    expect(connection.lastTransmission).toEqual(expected);
  });

  it("do not send subscription confirmation on initialize", () => {
    expect(connection.lastTransmission).toBeNull();
  });

  it("subscription confirmation on subscribe_to_channel", async () => {
    const expected = { identifier: "{id: 1}", type: "confirm_subscription" };
    await channel.subscribeToChannel();
    expect(connection.lastTransmission).toEqual(expected);
  });

  // PERMANENT-SKIP: CLAUDE.md, "Method visibility is compile-time only (`Module#private`, `basic_obj_respond_to`'s `pub`)" — the private `rm_rf` and `error_handler` are still listed by `action_methods`.
  it.skip("actions available on Channel", () => {
    const availableActions = new Set([
      "room",
      "lastAction",
      "subscribed",
      "unsubscribed",
      "toggleSubscribed",
      "leave",
      "speak",
      "isSubscribed",
      "getLatest",
      "receive",
      "chatters",
      "topic",
      "errorAction",
    ]);
    expect(ChatChannel.actionMethods()).toEqual(availableActions);
  });

  it("invalid action on Channel", async () => {
    await assertLogged(
      "Unable to process ActionCable::Channel::BaseTest::ChatChannel#invalidAction",
      () => channel.performAction({ action: "invalidAction" }),
    );
  });

  it("notification for perform_action", async () => {
    const events: NotificationEvent[] = [];
    Notifications.subscribe("perform_action.action_cable", (event) => events.push(event));
    try {
      const data = { action: "speak", content: "hello" };
      await channel.performAction(data);

      expect(events.length).toBe(1);
      expect(events[0].name).toBe("perform_action.action_cable");
      expect(events[0].payload.channelClass).toBe("ActionCable::Channel::BaseTest::ChatChannel");
      expect(events[0].payload.action).toBe("speak");
      expect(events[0].payload.data).toEqual(data);
    } finally {
      Notifications.unsubscribe("perform_action.action_cable");
    }
  });

  it("notification for transmit", async () => {
    const events: NotificationEvent[] = [];
    Notifications.subscribe("transmit.action_cable", (event) => events.push(event));
    try {
      await channel.performAction({ action: "getLatest" });
      const expectedData = { data: "latest" };

      expect(events.length).toBe(1);
      expect(events[0].name).toBe("transmit.action_cable");
      expect(events[0].payload.channelClass).toBe("ActionCable::Channel::BaseTest::ChatChannel");
      expect(events[0].payload.data).toEqual(expectedData);
      expect(events[0].payload.via).toBeNull();
    } finally {
      Notifications.unsubscribe("transmit.action_cable");
    }
  });

  it("notification for transmit_subscription_confirmation", async () => {
    await channel.subscribeToChannel();

    const events: NotificationEvent[] = [];
    Notifications.subscribe("transmit_subscription_confirmation.action_cable", (e) =>
      events.push(e),
    );
    try {
      const host = channel as unknown as {
        isSubscriptionConfirmationSent(): boolean;
        transmitSubscriptionConfirmation(): unknown;
      };
      stub(host, "isSubscriptionConfirmationSent", false, [], () => {
        host.transmitSubscriptionConfirmation();

        expect(events.length).toBe(1);
        expect(events[0].name).toBe("transmit_subscription_confirmation.action_cable");
        expect(events[0].payload.channelClass).toBe("ActionCable::Channel::BaseTest::ChatChannel");
        expect(events[0].payload.identifier).toBe("{id: 1}");
      });
    } finally {
      Notifications.unsubscribe("transmit_subscription_confirmation.action_cable");
    }
  });

  it("notification for transmit_subscription_rejection", () => {
    const events: NotificationEvent[] = [];
    Notifications.subscribe("transmit_subscription_rejection.action_cable", (event) =>
      events.push(event),
    );
    try {
      (
        channel as unknown as { transmitSubscriptionRejection(): unknown }
      ).transmitSubscriptionRejection();

      expect(events.length).toBe(1);
      expect(events[0].name).toBe("transmit_subscription_rejection.action_cable");
      expect(events[0].payload.channelClass).toBe("ActionCable::Channel::BaseTest::ChatChannel");
      expect(events[0].payload.identifier).toBe("{id: 1}");
    } finally {
      Notifications.unsubscribe("transmit_subscription_rejection.action_cable");
    }
  });

  it("behaves like rescuable", async () => {
    await channel.performAction({ action: "errorAction" });
    expect(channel.lastAction).toEqual(["error_action"]);
  });
});
