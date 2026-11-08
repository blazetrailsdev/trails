import {
  ActiveSupportJSON,
  assert,
  assertEqual,
  _assertNothingRaisedOrWarn,
  delegate,
} from "@blazetrails/activesupport";
import { classModule, rbCallSuper, rbEqual, rbObjIvarSet, toS } from "@blazetrails/ruby-compat";
import { ActionCable } from "./namespaces.js";
import type { AsyncServer } from "./subscription-adapter/async.js";
import { Test } from "./subscription-adapter/test.js";

type Block = (() => unknown) | null;

export async function beforeSetup(this: TestHelper): Promise<unknown> {
  const server = ActionCable.server() as AsyncServer & { pubsub: unknown };
  const testAdapter = new Test(server);

  this._oldPubsubAdapter = server.pubsub;

  rbObjIvarSet(server, "@pubsub", testAdapter);
  return await rbCallSuper(this, beforeSetup);
}

export async function afterTeardown(this: TestHelper): Promise<void> {
  await rbCallSuper(this, afterTeardown);
  rbObjIvarSet(ActionCable.server() as object, "@pubsub", this._oldPubsubAdapter);
}

export async function assertBroadcasts(
  this: TestHelper,
  stream: string,
  number: number,
  block: Block = null,
): Promise<void> {
  if (block) {
    const newMessages = await newBroadcastsFrom.call(
      this,
      this.broadcasts(stream),
      stream,
      "assert_broadcasts",
      block,
    );

    const actualCount = newMessages.length;
    assertEqual(
      number,
      actualCount,
      `${number} broadcasts to ${stream} expected, but ${actualCount} were sent`,
    );
  } else {
    const actualCount = this.broadcasts(stream).length;
    assertEqual(
      number,
      actualCount,
      `${number} broadcasts to ${stream} expected, but ${actualCount} were sent`,
    );
  }
}

export async function assertNoBroadcasts(
  this: TestHelper,
  stream: string,
  block: Block = null,
): Promise<void> {
  await this.assertBroadcasts(stream, 0, block);
}

export async function captureBroadcasts(
  this: TestHelper,
  stream: string,
  block: Block,
): Promise<unknown[]> {
  return (
    await newBroadcastsFrom.call(this, this.broadcasts(stream), stream, "capture_broadcasts", block)
  ).map((m) => ActiveSupportJSON.decode(m as string));
}

export async function assertBroadcastOn(
  this: TestHelper,
  stream: string,
  data: unknown,
  block: Block = null,
): Promise<void> {
  const serializedMsg = ActiveSupportJSON.decode(ActiveSupportJSON.encode(data));

  let newMessages = this.broadcasts(stream);
  if (block) {
    newMessages = await newBroadcastsFrom.call(
      this,
      newMessages,
      stream,
      "assert_broadcast_on",
      block,
    );
  }

  const message = newMessages.find((msg) =>
    rbEqual(ActiveSupportJSON.decode(msg as string), serializedMsg),
  );

  let errorMessage = `No messages sent with ${toS(data)} to ${stream}`;

  if (newMessages.length > 0) {
    errorMessage = newMessages.reduce<string>(
      (errorMessage, newMessage) =>
        errorMessage + `${toS(ActiveSupportJSON.decode(newMessage as string))}\n`,
      `${errorMessage}\nMessage(s) found:\n`,
    );
  } else {
    errorMessage = `${errorMessage}\nNo message found for ${stream}`;
  }

  assert(message, errorMessage);
}

export function pubsubAdapter(): Test {
  return (ActionCable.server() as { pubsub: Test }).pubsub;
}

/** @internal */
async function newBroadcastsFrom(
  this: TestHelper,
  currentMessages: unknown[],
  stream: string,
  assertion: string,
  block: Block,
): Promise<unknown[]> {
  const oldMessages = currentMessages;
  this.clearMessages(stream);

  await _assertNothingRaisedOrWarn(assertion, block ?? undefined);
  const newMessages = this.broadcasts(stream);
  this.clearMessages(stream);

  for (const m of [...oldMessages, ...newMessages]) await this.pubsubAdapter().broadcast(stream, m);

  return newMessages;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TestHelper {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface TestHelper {
  _oldPubsubAdapter: unknown;
  beforeSetup: typeof beforeSetup;
  afterTeardown: typeof afterTeardown;
  assertBroadcasts: typeof assertBroadcasts;
  assertNoBroadcasts: typeof assertNoBroadcasts;
  captureBroadcasts: typeof captureBroadcasts;
  assertBroadcastOn: typeof assertBroadcastOn;
  pubsubAdapter: typeof pubsubAdapter;
  broadcasts(stream: string): unknown[];
  clearMessages(stream: string): unknown[];
}
Object.assign(TestHelper.prototype, {
  beforeSetup,
  afterTeardown,
  assertBroadcasts,
  assertNoBroadcasts,
  captureBroadcasts,
  assertBroadcastOn,
  pubsubAdapter,
});
delegate.call(TestHelper.prototype, "broadcasts", "clearMessages", { to: "pubsubAdapter" });
ActionCable.TestHelper = TestHelper;
