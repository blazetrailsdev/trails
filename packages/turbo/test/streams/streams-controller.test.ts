import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IntegrationTest } from "@blazetrails/actionpack/testing";
import { app } from "../test-helper.js";
import "../dummy/app/controllers/messages-controller.js";
import { Message } from "../dummy/app/models/message.js";
import { ApplicationController } from "../dummy/app/controllers/application-controller.js";
import type { IntegrationTestAssertions } from "../../lib/test-assertions/integration-test-assertions.js";
import type { TestAssertions } from "../../lib/test-assertions.js";

type Host = IntegrationTest &
  typeof IntegrationTestAssertions &
  Pick<typeof TestAssertions, "assertTurboFrame">;

let t: Host;

const render = (record: Message): Promise<unknown> => ApplicationController.render(record);

const urlHelpers = () =>
  app.routes().urlHelpers() as unknown as Record<string, (...args: unknown[]) => string>;

describe("Turbo::StreamsControllerTest", () => {
  beforeAll(async () => {
    await Message.loadSchema();
  });

  beforeEach(() => {
    t = new IntegrationTest(expect.getState().currentTestName!) as Host;
    t.app = app;
    app.reloadRoutesUnlessLoaded();
  });

  it("create with respond to", async () => {
    await t.post(urlHelpers().messagesPath());
    t.assertRedirectedTo(urlHelpers().messagePath({ id: 1 }));

    await t.post(urlHelpers().messagesPath(), { as: ":turbo_stream" });
    t.assertNoTurboStream({ status: ":created", action: "update", target: "messages" });
    t.assertTurboStream(
      { status: ":created", action: "append", target: "messages" },
      (selected) => {
        expect((selected as { children: { toHtml(): string } }).children.toHtml()).toBe(
          "<template>message_1</template>",
        );
      },
    );
  });

  it("show all turbo actions", async () => {
    const [message1, message5] = (await Message.createBang([
      { id: 1, content: "My message" },
      { id: 5, content: "OLLA!" },
    ])) as unknown as [Message, Message];

    await t.get(
      urlHelpers().messagePath(message1, {
        other_message: message5,
      }),
      {
        as: ":turbo_stream",
      },
    );

    t.assertDomEqual(
      `<turbo-stream action="remove" target="message_1"></turbo-stream>
<turbo-stream action="replace" target="message_1"><template>${await render(message1)}</template></turbo-stream>
<turbo-stream action="replace" target="message_1"><template>Something else</template></turbo-stream>
<turbo-stream action="replace" target="message_5"><template>Something fifth</template></turbo-stream>
<turbo-stream method="morph" action="replace" target="message_5"><template>Something fifth</template></turbo-stream>
<turbo-stream method="morph" action="update" target="message_5"><template>Something fifth</template></turbo-stream>
<turbo-stream action="replace" target="message_5"><template>${await render(message5)}</template></turbo-stream>
<turbo-stream action="append" target="messages"><template>${await render(message1)}</template></turbo-stream>
<turbo-stream action="append" target="messages"><template>${await render(message5)}</template></turbo-stream>
<turbo-stream action="prepend" target="messages"><template>${await render(message1)}</template></turbo-stream>
<turbo-stream action="prepend" target="messages"><template>${await render(message5)}</template></turbo-stream>
`,
      t.response.body,
    );
  });

  it("update all turbo actions for multiple targets", async () => {
    const message1 = new Message({ id: 1, content: "My message" });
    const message5 = new Message({ id: 5, content: "OLLA!" });

    await t.patch(urlHelpers().messagePath({ id: 1 }), { as: ":turbo_stream" });

    t.assertTurboStream({ action: "replace", count: 5 });
    t.assertTurboStream({ action: "replace", targets: "#message_4" }, () => {
      t.assertSelect("template", "Something fourth");
    });
    t.assertDomEqual(
      `<turbo-stream action="remove" targets="#message_1"></turbo-stream>
<turbo-stream action="replace" targets="#message_1"><template>${await render(message1)}</template></turbo-stream>
<turbo-stream action="replace" targets="#message_1"><template>Something else</template></turbo-stream>
<turbo-stream action="replace" targets="#message_4"><template>Something fourth</template></turbo-stream>
<turbo-stream method="morph" action="replace" targets="#message_5"><template>Something fifth</template></turbo-stream>
<turbo-stream method="morph" action="update" targets="#message_5"><template>Something fifth</template></turbo-stream>
<turbo-stream action="replace" targets="#message_5"><template>${await render(message5)}</template></turbo-stream>
<turbo-stream action="append" targets="#messages"><template>${await render(message1)}</template></turbo-stream>
<turbo-stream action="append" targets="#messages"><template>${await render(message5)}</template></turbo-stream>
<turbo-stream action="prepend" targets="#messages"><template>${await render(message1)}</template></turbo-stream>
<turbo-stream action="prepend" targets="#messages"><template>${await render(message5)}</template></turbo-stream>
`,
      t.response.body,
    );
  });
  it("includes html format when rendering turbo_stream actions", async () => {
    await t.post(urlHelpers().postsPath(), { as: ":turbo_stream" });
    t.assertDomEqual(
      `<turbo-stream action="update" target="form-area"><template>
  Form
</template></turbo-stream>`,
      t.response.body,
    );
  });

  it("render correct partial for namespaced models", async () => {
    await t.get(urlHelpers().usersProfilePath({ id: 1 }), { as: ":turbo_stream" });
    t.assertDomEqual(
      `<turbo-stream action="replace" target="users_profile_1"><template><p>David</p></template></turbo-stream>
<turbo-stream action="update" target="users_profile_1"><template><p>David</p></template></turbo-stream>
`,
      t.response.body.replace(/\n(?=<\/)/g, ""),
    );
  });

  // BLOCKED: i18n-railtie-initializers-unported
  it.skip("render correct partial and I18n with a custom view path in the controller", async () => {
    await t.get(urlHelpers().adminCompanyPath({ id: 1 }), { as: ":turbo_stream" });
    t.assertDomEqual(
      `<turbo-stream action="replace" target="company_1"><template><p>Company:</p>
<p>Basecamp</p></template></turbo-stream>
`,
      t.response.body.replace(/\n(?=<\/)/g, ""),
    );
  });

  it("render a renderable object", async () => {
    await t.post(urlHelpers().notificationsPath(), { as: ":turbo_stream" });

    t.assertDomEqual(
      `<turbo-stream action="append" target="notifications"><template><div class='notification'>
  <p>Example notification</p>
</div></template></turbo-stream>`,
      t.response.body,
    );
  });
});
