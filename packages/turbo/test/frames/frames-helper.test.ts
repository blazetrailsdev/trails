/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeAll, beforeEach, describe, it } from "vitest";
import { block } from "@blazetrails/ruby-compat";
import { TestCase } from "@blazetrails/actionview/test-case.js";
import "../test-helper.js";
import { FramesHelper } from "../../lib/app/helpers/turbo/frames-helper.js";
import { Article } from "../dummy/app/models/article.js";
import { Message } from "../dummy/app/models/message.js";

type Tc = Record<string, any>;

class FramesHelperTest extends TestCase {}
(FramesHelperTest as any).tests(FramesHelper);

describe("Turbo::FramesHelperTest", () => {
  let tc: Tc;

  beforeAll(async () => {
    await Message.loadSchema();
    await Article.loadSchema();
  });

  beforeEach(async ({ task }) => {
    tc = new (FramesHelperTest as any)(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("frame with src", () => {
    tc.assertDomEqual(
      '<turbo-frame src="/trays/1" id="tray"></turbo-frame>',
      String(tc.turboFrameTag("tray", { src: "/trays/1" })),
    );
  });

  it("frame with model src", async () => {
    const record = await Message.create({ id: "1", content: "ignored" });

    tc.assertDomEqual(
      '<turbo-frame src="/messages/1" id="message"></turbo-frame>',
      String(tc.turboFrameTag("message", { src: record })),
    );
  });

  it("frame with src and target", () => {
    tc.assertDomEqual(
      '<turbo-frame src="/trays/1" id="tray" target="_top"></turbo-frame>',
      String(tc.turboFrameTag("tray", { src: "/trays/1", target: "_top" })),
    );
  });

  it("frame with model argument", () => {
    const record = new Message({ id: "1", content: "ignored" });

    tc.assertDomEqual(
      '<turbo-frame id="message_1"></turbo-frame>',
      String(tc.turboFrameTag(record)),
    );
  });

  it("frame with model class argument", () => {
    tc.assertDomEqual(
      '<turbo-frame id="new_message"></turbo-frame>',
      String(tc.turboFrameTag(Message)),
    );
  });

  it("string frame within a model frame", () => {
    const record = new Article({ id: 1 });

    tc.assertDomEqual(
      '<turbo-frame id="comments_article_1"></turbo-frame>',
      String(tc.turboFrameTag(record, "comments")),
    );
  });

  it("string frame with non-record array", () => {
    tc.assertDomEqual(
      '<turbo-frame id="foo_1_2"></turbo-frame>',
      String(tc.turboFrameTag(["foo", 1, 2])),
    );
  });

  it("block style", async () => {
    tc.assertDomEqual(
      '<turbo-frame id="tray"><p>tray!</p></turbo-frame>',
      String(
        await tc.turboFrameTag(
          "tray",
          block(() => tc.tag().p("tray!")),
        ),
      ),
    );
  });
});
