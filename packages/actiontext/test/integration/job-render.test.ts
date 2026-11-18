import { afterEach, beforeEach, describe, it } from "vitest";
import { TestCase as ActiveJobTestCase } from "@blazetrails/activejob/test-case";
import type { TestHelper as ActiveJobTestHelper } from "@blazetrails/activejob/test-helper";
import { Dir, File, include } from "@blazetrails/ruby-compat";
import * as SelectorAssertions from "@blazetrails/actionview/rails-dom-testing/assertions/selector-assertions.js";
import { app, createFileBlob, fixturesAll } from "../test-helper.js";
import { ActionText } from "../../lib/action-text.js";
import { Content } from "../../lib/content.js";
import { BroadcastJob } from "../dummy/app/jobs/broadcast-job.js";
import { Message } from "../dummy/app/models/message.js";

class JobRenderTest extends ActiveJobTestCase {
  usesAppDefaultUrlOptions(): void {}

  /** @internal */
  async withDefaultUrlOptions(
    defaultUrlOptions: Record<string, unknown>,
    block: () => Promise<void>,
  ): Promise<void> {
    const originalDefaultUrlOptions = app.defaultUrlOptions;
    try {
      app.defaultUrlOptions = defaultUrlOptions;
      await block();
    } finally {
      app.defaultUrlOptions = originalDefaultUrlOptions;
    }
  }
}
include(JobRenderTest, SelectorAssertions);

describe("ActionText::JobRenderTest", () => {
  fixturesAll();
  let t: JobRenderTest & ActiveJobTestHelper & { assertSelect(...args: unknown[]): unknown };

  beforeEach(async () => {
    t = new JobRenderTest("usesAppDefaultUrlOptions") as unknown as typeof t;
    await t.beforeSetup();
  });

  afterEach(async () => {
    await t.afterTeardown();
  });

  it("uses app default_url_options", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg", contentType: "image/jpeg" });
    const message = await Message.createBang({
      content: await (await Content.new()).appendAttachables(blob),
    });

    await Dir.mktmpdir(null, null, {}, async (dir: string) => {
      const file = File.join(dir, "broadcast.html");

      await BroadcastJob.performLater(file, message);

      await t.withDefaultUrlOptions({ host: "foo.example.com", port: 9001 }, async () => {
        await t.performEnqueuedJobs();
      });

      const rendered = ActionText.htmlDocumentFragmentClass().parse(await File.readAsync(file));
      t.assertSelect(rendered, "img:match('src', ?)", /\/\/foo.example.com:9001\/.+\/racecar/);
    });
  });
});
