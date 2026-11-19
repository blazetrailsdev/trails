import {
  ActiveSupportJSON,
  Concern,
  extend,
  include,
  included,
  pluralize,
} from "@blazetrails/activesupport";
import { assert, assertNotEmpty } from "@blazetrails/activesupport/testing/assertions";
import { TestHelper as ActionCableTestHelper } from "@blazetrails/actioncable/test-helper";
import { HTML5 } from "@blazetrails/nokogiri";
import type { Html5Node } from "@blazetrails/nokogiri";
import { rbInspect } from "@blazetrails/ruby-compat";
import { StreamName } from "../app/channels/turbo/streams/stream-name.js";
import { Broadcastable } from "../app/models/concerns/turbo/broadcastable.js";

type Block = (() => unknown) | null;
type TestHelperHost = ActionCableTestHelper & {
  streamNameFrom(streamables: unknown): string;
  captureTurboStreamBroadcasts(streamNameOrObject: unknown, block?: Block): Promise<Html5Node[]>;
};

export const TestHelper = {
  async assertTurboStreamBroadcasts(
    this: TestHelperHost,
    streamNameOrObject: unknown,
    { count = null }: { count?: number | null } = {},
    block: Block = null,
  ): Promise<void> {
    const payloads = await this.captureTurboStreamBroadcasts(streamNameOrObject, block);
    const streamName = this.streamNameFrom(streamNameOrObject);

    if (count == null) {
      assertNotEmpty(
        payloads,
        `Expected at least one broadcast on ${rbInspect(streamName)}, but there were none`,
      );
    } else {
      const broadcasts = pluralize("Turbo Stream broadcast", count);

      assert(
        count === payloads.length,
        `Expected ${count} ${broadcasts} on ${rbInspect(streamName)}, but there were ${payloads.length}`,
      );
    }
  },

  async assertNoTurboStreamBroadcasts(
    this: TestHelperHost,
    streamNameOrObject: unknown,
    block: Block = null,
  ): Promise<void> {
    if (block) await block();

    const streamName = this.streamNameFrom(streamNameOrObject);

    const payloads = this.broadcasts(streamName);

    assert(
      payloads.length === 0,
      `Expected no broadcasts on ${rbInspect(streamName)}, but there were ${payloads.length}`,
    );
  },

  async captureTurboStreamBroadcasts(
    this: TestHelperHost,
    streamNameOrObject: unknown,
    block: Block = null,
  ): Promise<Html5Node[]> {
    const streamName = this.streamNameFrom(streamNameOrObject);
    const payloads =
      block != null
        ? await this.newBroadcastsFrom(
            this.broadcasts(streamName),
            streamName,
            "capture_turbo_stream_broadcasts",
            block,
          )
        : this.broadcasts(streamName);

    return payloads.flatMap((payload) => {
      const html = ActiveSupportJSON.decode(payload as string) as string;
      const document = HTML5.Document.parse(html);

      return document.at("body")!.elementChildren as Html5Node[];
    });
  },

  [included](base: object): void {
    include(base, ActionCableTestHelper);

    include(base, StreamName);
  },
};
extend(TestHelper, Concern);
Object.assign(Broadcastable, { TestHelper });
