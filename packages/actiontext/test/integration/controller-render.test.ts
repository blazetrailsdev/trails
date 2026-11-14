import { beforeEach, describe, expect, it } from "vitest";
import { type RouteSet } from "@blazetrails/actionpack";
import { IntegrationTest } from "@blazetrails/actionpack/testing";
import { type HashWithIndifferentAccess, TopLevel } from "@blazetrails/activesupport";
import { block } from "@blazetrails/ruby-compat";
import { createFileBlob, fixturesAll } from "../test-helper.js";
import { ActionText } from "../../lib/action-text.js";
import { Content } from "../../lib/content.js";
import { Message } from "../dummy/app/models/message.js";
import type { Person } from "../dummy/app/models/person.js";

const routes = TopLevel.Trails!.application!.routes() as unknown as RouteSet;
let t: IntegrationTest & { assertSelect(...args: unknown[]): unknown };
const urlHelpers = () =>
  routes.urlHelpers() as unknown as Record<
    "messagePath" | "editMessagePath" | "adminMessagePath" | "messagesPath",
    (...args: unknown[]) => string
  >;

describe("ActionText::ControllerRenderTest", () => {
  const fx = fixturesAll() as unknown as {
    messages(name: string): Promise<Message>;
    people(name: string): Promise<Person>;
  };

  beforeEach(() => {
    t = new IntegrationTest(expect.getState().currentTestName!) as typeof t;
    t.app = routes;
  });

  it.skip("uses current request environment", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg", contentType: "image/jpeg" });
    const message = await Message.createBang({
      content: await new Content().appendAttachables(blob),
    });

    t.hostBang("loocalhoost");
    await t.get(urlHelpers().messagePath(message));
    t.assertSelect(
      "#content img",
      block((imgs: Array<{ get(k: string): string }>) => {
        for (const img of imgs) expect(img.get("src")).toMatch(/\/\/loocalhoost\//);
      }),
    );
  });

  it.skip("renders as HTML when the request format is not HTML", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg", contentType: "image/jpeg" });
    const message = await Message.createBang({
      content: await new Content().appendAttachables(blob),
    });

    t.hostBang("loocalhoost");
    await t.get(urlHelpers().messagePath(message, { format: "json" }));
    const content = ActionText.htmlDocumentFragmentClass().parse(
      (t.response.parsedBody as HashWithIndifferentAccess).get("content") as string,
    );
    t.assertSelect(content, "img:match('src', ?)", /\/\/loocalhoost\/.+\/racecar/);
  });

  it("renders Trix with content attachment as HTML when the request format is not HTML", async () => {
    const messageWithPersonAttachment = await fx.messages("hello_alice");

    await t.get(urlHelpers().editMessagePath(messageWithPersonAttachment, { format: "json" }));

    const formHtml = (t.response.parsedBody as HashWithIndifferentAccess).get("form") as string;
    expect(formHtml).toMatch(/ class=\S+mentionable-person\b/);
  });

  it("resolves partials when controller is namespaced", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg", contentType: "image/jpeg" });
    const message = await Message.createBang({
      content: await new Content().appendAttachables(blob),
    });

    await t.get(urlHelpers().adminMessagePath(message));
    t.assertSelect("#content-html .trix-content .attachment--jpg");
  });

  it("resolves ActionText::Attachable based on their to_attachable_partial_path", async () => {
    const alice = await fx.people("alice");

    await t.get(urlHelpers().messagesPath());

    t.assertSelect(".mentioned-person", { text: alice.name });
  });

  it("resolves missing ActionText::Attachable based on their to_missing_attachable_partial_path", async () => {
    const alice = await fx.people("alice");
    await alice.destroyBang();

    await t.get(urlHelpers().messagesPath());

    t.assertSelect(".missing-attachable", { text: "Missing person" });
  });
});
