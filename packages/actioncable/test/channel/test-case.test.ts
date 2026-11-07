import { describe, expect, it, type TestContext } from "vitest";
import { assertEqual } from "@blazetrails/activesupport";
import { hashAref, TopLevel, constSet } from "@blazetrails/ruby-compat";
import "../support/test-helper.js";
import { User } from "../support/stubs/user.js";
import { ActionCable } from "../../lib/namespaces.js";
import { Base } from "../../lib/channel/base.js";
import type { Broadcasting } from "../../lib/channel/broadcasting.js";
import { TestCase } from "../../lib/channel/test-case.js";

type Data = Record<string, unknown>;
type ChannelContext = TestContext & { testCase: TestCase };

class TestTestChannel extends Base {}
constSet(TopLevel, "TestTestChannel", TestTestChannel);

class NonInferrableExplicitClassChannelTest extends TestCase {}
NonInferrableExplicitClassChannelTest.tests(TestTestChannel);
constSet(TopLevel, "NonInferrableExplicitClassChannelTest", NonInferrableExplicitClassChannelTest);

describe("NonInferrableExplicitClassChannelTest", () => {
  it("set channel class manual", () => {
    expect(NonInferrableExplicitClassChannelTest.channelClass()).toBe(TestTestChannel);
  });
});

class NonInferrableSymbolNameChannelTest extends TestCase {}
NonInferrableSymbolNameChannelTest.tests("test_test_channel");
constSet(TopLevel, "NonInferrableSymbolNameChannelTest", NonInferrableSymbolNameChannelTest);

describe("NonInferrableSymbolNameChannelTest", () => {
  it("set channel class manual using symbol", () => {
    expect(NonInferrableSymbolNameChannelTest.channelClass()).toBe(TestTestChannel);
  });
});

class NonInferrableStringNameChannelTest extends TestCase {}
NonInferrableStringNameChannelTest.tests("test_test_channel");
constSet(TopLevel, "NonInferrableStringNameChannelTest", NonInferrableStringNameChannelTest);

describe("NonInferrableStringNameChannelTest", () => {
  it("set channel class manual using string", () => {
    expect(NonInferrableStringNameChannelTest.channelClass()).toBe(TestTestChannel);
  });
});

class SubscriptionsTestChannel extends Base {}
constSet(TopLevel, "SubscriptionsTestChannel", SubscriptionsTestChannel);

class SubscriptionsTestChannelTest extends TestCase {
  setup(): void {
    this.stubConnection();
  }
}
constSet(TopLevel, "SubscriptionsTestChannelTest", SubscriptionsTestChannelTest);

describe("SubscriptionsTestChannelTest", () => {
  it("no subscribe", ({ testCase: t }: ChannelContext) => {
    expect(t.subscription).toBeNull();
  });

  it("subscribe", async ({ testCase: t }: ChannelContext) => {
    await t.subscribe();

    expect(t.subscription!.isConfirmed()).toBeRubyTruthy();
    expect(t.subscription!.isRejected()).toBeFalsy();
    expect(t.connection!.transmissions.length).toBe(1);
    expect(hashAref(t.connection!.transmissions.at(-1)!, "type")).toBe(
      ActionCable.INTERNAL.messageTypes.confirmation,
    );
  });
});

class StubConnectionTest extends TestCase {}
StubConnectionTest.tests(SubscriptionsTestChannel);
constSet(TopLevel, "StubConnectionTest", StubConnectionTest);

describe("StubConnectionTest", () => {
  it("connection identifiers", async ({ testCase: t }: ChannelContext) => {
    t.stubConnection({ username: "John", admin: true });

    await t.subscribe();

    const subscription = t.subscription as unknown as { username(): unknown; admin(): unknown };
    expect(subscription.username()).toBe("John");
    expect(subscription.admin()).toBeTruthy();
    expect(t.connection!.connectionIdentifier).toBe("John:true");
  });
});

class RejectionTestChannel extends Base {
  subscribed(): void {
    this.reject();
  }
}
constSet(TopLevel, "RejectionTestChannel", RejectionTestChannel);

class RejectionTestChannelTest extends TestCase {}
constSet(TopLevel, "RejectionTestChannelTest", RejectionTestChannelTest);

describe("RejectionTestChannelTest", () => {
  it("rejection", async ({ testCase: t }: ChannelContext) => {
    await t.subscribe();

    expect(t.subscription!.isConfirmed()).toBeFalsy();
    expect(t.subscription!.isRejected()).toBeRubyTruthy();
    expect(t.connection!.transmissions.length).toBe(1);
    expect(hashAref(t.connection!.transmissions.at(-1)!, "type")).toBe(
      ActionCable.INTERNAL.messageTypes.rejection,
    );
  });
});

class StreamsTestChannel extends Base {
  subscribed(): void {
    this.streamFrom(`test_${hashAref(this.params, "id") ?? 0}`);
  }

  async unsubscribed(): Promise<void> {
    await this.stopStreamFrom(`test_${hashAref(this.params, "id") ?? 0}`);
  }
}
constSet(TopLevel, "StreamsTestChannel", StreamsTestChannel);

class StreamsTestChannelTest extends TestCase {}
constSet(TopLevel, "StreamsTestChannelTest", StreamsTestChannelTest);

describe("StreamsTestChannelTest", () => {
  it("stream without params", async ({ testCase: t }: ChannelContext) => {
    await t.subscribe();

    t.assertHasStream("test_0");
  });

  it("stream with params", async ({ testCase: t }: ChannelContext) => {
    await t.subscribe({ id: 42 });

    t.assertHasStream("test_42");
  });

  it("not stream without params", async ({ testCase: t }: ChannelContext) => {
    await t.subscribe();
    await t.unsubscribe();

    t.assertHasNoStream("test_0");
  });

  it("not stream with params", async ({ testCase: t }: ChannelContext) => {
    await t.subscribe({ id: 42 });
    await t.perform("unsubscribed", { id: 42 });

    t.assertHasNoStream("test_42");
  });

  it("unsubscribe from stream", async ({ testCase: t }: ChannelContext) => {
    await t.subscribe();
    await t.unsubscribe();

    t.assertNoStreams();
  });
});

class StreamsForTestChannel extends Base {
  subscribed(): void {
    this.streamFor(new User(hashAref(this.params, "id") as string));
  }

  async unsubscribed(): Promise<void> {
    await this.stopStreamFor(new User(hashAref(this.params, "id") as string));
  }
}
constSet(TopLevel, "StreamsForTestChannel", StreamsForTestChannel);

class StreamsForTestChannelTest extends TestCase {}
constSet(TopLevel, "StreamsForTestChannelTest", StreamsForTestChannelTest);

describe("StreamsForTestChannelTest", () => {
  it("stream with params", async ({ testCase: t }: ChannelContext) => {
    await t.subscribe({ id: 42 });

    t.assertHasStreamFor(new User(42 as never));
  });

  it("not stream with params", async ({ testCase: t }: ChannelContext) => {
    await t.subscribe({ id: 42 });
    await t.perform("unsubscribed", { id: 42 });

    t.assertHasNoStreamFor(new User(42 as never));
  });
});

class NoStreamsTestChannel extends Base {
  subscribed(): void {}
}
constSet(TopLevel, "NoStreamsTestChannel", NoStreamsTestChannel);

class NoStreamsTestChannelTest extends TestCase {}
constSet(TopLevel, "NoStreamsTestChannelTest", NoStreamsTestChannelTest);

describe("NoStreamsTestChannelTest", () => {
  it("stream with params", async ({ testCase: t }: ChannelContext) => {
    await t.subscribe();

    t.assertNoStreams();
  });
});

class PerformTestChannel extends Base {
  echo(data: Data): void {
    delete data["action"];
    this.transmit(data);
  }

  ping(): void {
    this.transmit({ type: "pong" });
  }
}
constSet(TopLevel, "PerformTestChannel", PerformTestChannel);

class PerformTestChannelTest extends TestCase {
  async setup(): Promise<void> {
    this.stubConnection({ userId: 2016 });
    await this.subscribe({ id: 5 });
  }
}
constSet(TopLevel, "PerformTestChannelTest", PerformTestChannelTest);

describe("PerformTestChannelTest", () => {
  it("perform with params", async ({ testCase: t }: ChannelContext) => {
    await t.perform("echo", { text: "You are man!" });

    assertEqual({ text: "You are man!" }, t.transmissions().at(-1));
  });

  it("perform and transmit", async ({ testCase: t }: ChannelContext) => {
    await t.perform("ping");

    expect(hashAref(t.transmissions().at(-1) as Data, "type")).toBe("pong");
  });
});

class PerformUnsubscribedTestChannelTest extends TestCase {}
PerformUnsubscribedTestChannelTest.tests(PerformTestChannel);
constSet(TopLevel, "PerformUnsubscribedTestChannelTest", PerformUnsubscribedTestChannelTest);

describe("PerformUnsubscribedTestChannelTest", () => {
  it("perform when unsubscribed", async ({ testCase: t }: ChannelContext) => {
    await expect(t.perform("echo")).rejects.toThrow();
  });
});

class BroadcastsTestChannel extends Base {
  async broadcast(data: Data): Promise<void> {
    await (
      ActionCable.server() as { broadcast(b: string, m: unknown): Promise<unknown> }
    ).broadcast(`broadcast_${hashAref(this.params, "id")}`, {
      text: data["message"],
      userId: (this as unknown as { userId(): unknown }).userId(),
    });
  }

  async broadcastToUser(data: Data): Promise<void> {
    const user = new User((this as unknown as { userId(): string }).userId());

    await (this as unknown as typeof Broadcasting).broadcastTo(user, { text: data["message"] });
  }
}
constSet(TopLevel, "BroadcastsTestChannel", BroadcastsTestChannel);

class BroadcastsTestChannelTest extends TestCase {
  async setup(): Promise<void> {
    this.stubConnection({ userId: 2017 });
    await this.subscribe({ id: 5 });
  }
}
constSet(TopLevel, "BroadcastsTestChannelTest", BroadcastsTestChannelTest);

describe("BroadcastsTestChannelTest", () => {
  it("broadcast matchers included", async ({ testCase: t }: ChannelContext) => {
    await t.assertBroadcastOn("broadcast_5", { userId: 2017, text: "SOS" }, () =>
      t.perform("broadcast", { message: "SOS" }),
    );
  });

  it("broadcast to object", async ({ testCase: t }: ChannelContext) => {
    const user = new User(2017 as never);

    await t.assertBroadcasts(user, 1, () => t.perform("broadcastToUser", { text: "SOS" }));
  });

  it("broadcast to object with data", async ({ testCase: t }: ChannelContext) => {
    const user = new User(2017 as never);

    await t.assertBroadcastOn(user, { text: "SOS" }, () =>
      t.perform("broadcastToUser", { message: "SOS" }),
    );
  });
});
