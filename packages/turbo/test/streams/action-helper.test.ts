import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import "../test-helper.js";
import { Turbo } from "../../lib/turbo-trails.js";
import { ActionHelper } from "../../lib/app/helpers/turbo/streams/action-helper.js";
import { Message } from "../dummy/app/models/message.js";

class ActionHelperTest {}
include(ActionHelperTest, ActionHelper);
type ActionHelperHost = {
  turboStreamActionTag(action: string, options?: Record<string, unknown>): unknown;
  turboStreamRefreshTag(options?: Record<string, unknown>): unknown;
};

describe("Turbo::ActionHelperTest", () => {
  let tc: ActionHelperHost;

  beforeAll(async () => {
    await Message.loadSchema();
  });

  beforeEach(() => {
    Turbo.currentRequestId = null;
    tc = new ActionHelperTest() as unknown as ActionHelperHost;
  });

  it("target responds to #to_key", () => {
    const message = new Message({ id: 1 });

    const stream =
      '<turbo-stream action="append" target="message_1"><template></template></turbo-stream>';

    expect(String(tc.turboStreamActionTag("append", { target: message }))).toBe(stream);
  });

  it("target is a model class", () => {
    const message = Message;

    const stream =
      '<turbo-stream action="append" target="new_message"><template></template></turbo-stream>';

    expect(String(tc.turboStreamActionTag("append", { target: message }))).toBe(stream);
  });

  it("target passed as array of dom_id arguments", () => {
    const message = new Message({ id: 1 });

    const stream =
      '<turbo-stream action="append" target="special_message_1"><template></template></turbo-stream>';

    expect(String(tc.turboStreamActionTag("append", { target: [message, "special"] }))).toBe(
      stream,
    );
  });

  it("target uses custom to_a", () => {
    class CustomToAClass extends Message {
      toA(): never {
        throw new Error("DO NOT CALL ME");
      }
    }

    const stream =
      '<turbo-stream action="append" target="new_custom_to_a_class"><template></template></turbo-stream>';
    expect(String(tc.turboStreamActionTag("append", { target: new CustomToAClass() }))).toBe(
      stream,
    );
  });

  it("no template", () => {
    const stream =
      '<turbo-stream action="append" target="message_1"><template></template></turbo-stream>';

    expect(String(tc.turboStreamActionTag("append", { target: "message_1" }))).toBe(stream);
  });

  it("additional attributes", () => {
    const stream =
      '<turbo-stream hello="world" foo="bar" action="append" target="message_1"><template>Template</template></turbo-stream>';

    expect(
      String(
        tc.turboStreamActionTag("append", {
          target: "message_1",
          template: "Template",
          hello: "world",
          foo: "bar",
        }),
      ),
    ).toBe(stream);
  });

  it("additional nil attributes", () => {
    const stream =
      '<turbo-stream action="append" target="message_1"><template>Template</template></turbo-stream>';

    expect(
      String(
        tc.turboStreamActionTag("append", {
          target: "message_1",
          template: "Template",
          hello: null,
          foo: null,
        }),
      ),
    ).toBe(stream);
  });

  it("additional boolean attributes", () => {
    const stream =
      '<turbo-stream checked="checked" action="append" target="message_1"><template>Template</template></turbo-stream>';

    expect(
      String(
        tc.turboStreamActionTag("append", {
          target: "message_1",
          template: "Template",
          checked: true,
        }),
      ),
    ).toBe(stream);
  });

  it("additional dashed attributes", () => {
    const stream =
      '<turbo-stream hello-world="foo" action="append" target="message_1"><template>Template</template></turbo-stream>';

    expect(
      String(
        tc.turboStreamActionTag("append", {
          target: "message_1",
          template: "Template",
          "hello-world": "foo",
        }),
      ),
    ).toBe(stream);
  });

  it("additional underscore attributes", () => {
    const stream =
      '<turbo-stream hello_world="foo" action="append" target="message_1"><template>Template</template></turbo-stream>';

    expect(
      String(
        tc.turboStreamActionTag("append", {
          target: "message_1",
          template: "Template",
          hello_world: "foo",
        }),
      ),
    ).toBe(stream);
  });

  it("additional data attributes", () => {
    const stream =
      '<turbo-stream data-value="foo" data-hello-world="bar" action="append" target="message_1"><template>Template</template></turbo-stream>';

    expect(
      String(
        tc.turboStreamActionTag("append", {
          target: "message_1",
          template: "Template",
          data: { value: "foo", hello_world: "bar" },
        }),
      ),
    ).toBe(stream);
  });

  it("additional aria attributes", () => {
    const stream =
      '<turbo-stream aria-label="foo" aria-checked="true" action="append" target="message_1"><template>Template</template></turbo-stream>';

    expect(
      String(
        tc.turboStreamActionTag("append", {
          target: "message_1",
          template: "Template",
          aria: { label: "foo", checked: true },
        }),
      ),
    ).toBe(stream);
  });

  it("additional class attribute", () => {
    const stream =
      '<turbo-stream class="stream" action="append" target="message_1"><template>Template</template></turbo-stream>';

    expect(
      String(
        tc.turboStreamActionTag("append", {
          target: "message_1",
          template: "Template",
          class: "stream",
        }),
      ),
    ).toBe(stream);
  });

  it("additional class conditional attribute", () => {
    const stream =
      '<turbo-stream class="stream another-stream" action="append" target="message_1"><template>Template</template></turbo-stream>';

    expect(
      String(
        tc.turboStreamActionTag("append", {
          target: "message_1",
          template: "Template",
          class: { stream: true, "another-stream": true, "no-stream": false },
        }),
      ),
    ).toBe(stream);
  });

  it("renders if no 'target' and no 'targets' attributes are provided", () => {
    let action: unknown;
    expect(() => {
      action = tc.turboStreamActionTag("my_custom_action");
    }).not.toThrow();

    expect(String(action)).toBe(
      '<turbo-stream action="my_custom_action"><template></template></turbo-stream>',
    );
  });

  it("turbo stream refresh tag", () => {
    const action = tc.turboStreamRefreshTag();

    expect(String(action)).toBe('<turbo-stream action="refresh"></turbo-stream>');
  });

  it("turbo stream refresh tag that carries the current request id", () => {
    Turbo.currentRequestId = "123";
    const action = tc.turboStreamRefreshTag();

    expect(String(action)).toBe('<turbo-stream request-id="123" action="refresh"></turbo-stream>');
  });
});
