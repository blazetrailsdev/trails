/* eslint-disable @typescript-eslint/no-explicit-any */
import { TagHelper } from "../../lib/tag-helper.js";
import { afterEach, beforeEach, describe, it } from "vitest";
import { I18n } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/actionview/test-case.js";
import "../test-helper.js";
import { Message } from "../dummy/app/models/message.js";

type Tc = Record<string, any>;

class FormHelperTest extends TestCase {
  get mainApp(): unknown {
    return (this as unknown as Tc).methodMissing("mainApp");
  }

  async formWith(this: Tc, ...args: unknown[]) {
    return (this.outputBuffer = await (TestCase.prototype as Tc).formWith.call(this, ...args));
  }
}
(FormHelperTest as any).tests(TagHelper);

describe("ActionText::FormHelperTest", () => {
  let tc: Tc;

  beforeEach(async ({ task }) => {
    tc = new FormHelperTest(task.name) as unknown as Tc;
    await tc.beforeSetup();
    tc.setup();
    I18n.backend().storeTranslations("placeholder", {
      activerecord: {
        attributes: {
          message: {
            title: "Story title",
          },
        },
      },
    });
  });

  afterEach(async () => {
    await I18n.backend().reloadBang();
  });

  it("#rich_textarea_tag helper", async () => {
    const message = new Message();

    tc.concat(
      await tc.richTextareaTag("content", (message as any).content, { input: "trix_input_1" }),
    );

    tc.assertDomEqual(
      '<input type="hidden" name="content" id="trix_input_1" autocomplete="off" />' +
        '<trix-editor input="trix_input_1" class="trix-content" data-direct-upload-url="http://test.host/trails/active_storage/direct_uploads" data-blob-url-template="http://test.host/trails/active_storage/blobs/redirect/:signed_id/:filename">' +
        "</trix-editor>",
      tc.outputBuffer.toStr(),
    );
  });

  it("#rich_textarea helper", async () => {
    tc.concat(await tc.richTextarea("message", "content", { input: "trix_input_1" }));

    tc.assertDomEqual(
      '<input type="hidden" name="message[content]" id="trix_input_1" autocomplete="off" />' +
        '<trix-editor id="message_content" input="trix_input_1" class="trix-content" data-direct-upload-url="http://test.host/trails/active_storage/direct_uploads" data-blob-url-template="http://test.host/trails/active_storage/blobs/redirect/:signed_id/:filename">' +
        "</trix-editor>",
      tc.outputBuffer.toStr(),
    );
  });

  it("#rich_textarea helper renders the :value argument into the hidden field", async () => {
    const message = new Message({ content: "<h1>hello world</h1>" } as any);

    tc.concat(
      await tc.richTextarea("message", "title", {
        value: (message as any).content,
        input: "trix_input_1",
      }),
    );

    tc.assertDomEqual(
      '<input type="hidden" name="message[title]" id="trix_input_1" value="&lt;h1&gt;hello world&lt;/h1&gt;" autocomplete="off" />' +
        '<trix-editor id="message_title" input="trix_input_1" class="trix-content" data-direct-upload-url="http://test.host/trails/active_storage/direct_uploads" data-blob-url-template="http://test.host/trails/active_storage/blobs/redirect/:signed_id/:filename">' +
        "</trix-editor>",
      tc.outputBuffer.toStr(),
    );
  });

  it("form with rich text area", async () => {
    await tc.formWith({ model: new Message(), scope: "message" }, (form: any) =>
      form.richTextarea("content"),
    );

    tc.assertDomEqual(
      '<form action="/messages" accept-charset="UTF-8" method="post">' +
        '<input type="hidden" name="message[content]" id="message_content_trix_input_message" autocomplete="off" />' +
        '<trix-editor id="message_content" input="message_content_trix_input_message" class="trix-content" data-direct-upload-url="http://test.host/trails/active_storage/direct_uploads" data-blob-url-template="http://test.host/trails/active_storage/blobs/redirect/:signed_id/:filename">' +
        "</trix-editor>" +
        "</form>",
      tc.outputBuffer.toStr(),
    );
  });

  it("form with rich text area having class", async () => {
    await tc.formWith({ model: new Message(), scope: "message" }, (form: any) =>
      form.richTextarea("content", { class: "custom-class" }),
    );

    tc.assertDomEqual(
      '<form action="/messages" accept-charset="UTF-8" method="post">' +
        '<input type="hidden" name="message[content]" id="message_content_trix_input_message" autocomplete="off" />' +
        '<trix-editor id="message_content" input="message_content_trix_input_message" class="custom-class" data-direct-upload-url="http://test.host/trails/active_storage/direct_uploads" data-blob-url-template="http://test.host/trails/active_storage/blobs/redirect/:signed_id/:filename">' +
        "</trix-editor>" +
        "</form>",
      tc.outputBuffer.toStr(),
    );
  });

  it("form with rich text area and error wrapper", async () => {
    const message = new Message();
    message.errors.add("content", "blank");

    await tc.formWith({ model: message, scope: "message" }, (form: any) =>
      form.richTextarea("content"),
    );

    tc.assertDomEqual(
      '<form action="/messages" accept-charset="UTF-8" method="post">' +
        '<div class="field_with_errors">' +
        '<input type="hidden" name="message[content]" id="message_content_trix_input_message" autocomplete="off" />' +
        '<trix-editor id="message_content" input="message_content_trix_input_message" class="trix-content" data-direct-upload-url="http://test.host/trails/active_storage/direct_uploads" data-blob-url-template="http://test.host/trails/active_storage/blobs/redirect/:signed_id/:filename">' +
        "</trix-editor>" +
        "</div>" +
        "</form>",
      tc.outputBuffer.toStr(),
    );
  });

  it("form with rich text area for non-attribute", async () => {
    await tc.formWith({ model: new Message(), scope: "message" }, (form: any) =>
      form.richTextarea("not_an_attribute"),
    );

    tc.assertDomEqual(
      '<form action="/messages" accept-charset="UTF-8" method="post">' +
        '<input type="hidden" name="message[not_an_attribute]" id="message_not_an_attribute_trix_input_message" autocomplete="off" />' +
        '<trix-editor id="message_not_an_attribute" input="message_not_an_attribute_trix_input_message" class="trix-content" data-direct-upload-url="http://test.host/trails/active_storage/direct_uploads" data-blob-url-template="http://test.host/trails/active_storage/blobs/redirect/:signed_id/:filename">' +
        "</trix-editor>" +
        "</form>",
      tc.outputBuffer.toStr(),
    );
  });

  it("modelless form with rich text area", async () => {
    await tc.formWith({ url: "/messages", scope: "message" }, (form: any) =>
      form.richTextarea("content", { input: "trix_input_2" }),
    );

    tc.assertDomEqual(
      '<form action="/messages" accept-charset="UTF-8" method="post">' +
        '<input type="hidden" name="message[content]" id="trix_input_2" autocomplete="off" />' +
        '<trix-editor id="message_content" input="trix_input_2" class="trix-content" data-direct-upload-url="http://test.host/trails/active_storage/direct_uploads" data-blob-url-template="http://test.host/trails/active_storage/blobs/redirect/:signed_id/:filename">' +
        "</trix-editor>" +
        "</form>",
      tc.outputBuffer.toStr(),
    );
  });

  it("form with rich text area having placeholder without locale", async () => {
    await tc.formWith({ model: new Message(), scope: "message" }, (form: any) =>
      form.richTextarea("content", { placeholder: true }),
    );

    tc.assertDomEqual(
      '<form action="/messages" accept-charset="UTF-8" method="post">' +
        '<input type="hidden" name="message[content]" id="message_content_trix_input_message" autocomplete="off" />' +
        '<trix-editor placeholder="Content" id="message_content" input="message_content_trix_input_message" class="trix-content" data-direct-upload-url="http://test.host/trails/active_storage/direct_uploads" data-blob-url-template="http://test.host/trails/active_storage/blobs/redirect/:signed_id/:filename">' +
        "</trix-editor>" +
        "</form>",
      tc.outputBuffer.toStr(),
    );
  });

  it("form with rich text area having placeholder with locale", async () => {
    await I18n.withLocale("placeholder", () =>
      tc.formWith({ model: new Message(), scope: "message" }, (form: any) =>
        form.richTextarea("title", { placeholder: true }),
      ),
    );

    tc.assertDomEqual(
      '<form action="/messages" accept-charset="UTF-8" method="post">' +
        '<input type="hidden" name="message[title]" id="message_title_trix_input_message" autocomplete="off" />' +
        '<trix-editor placeholder="Story title" id="message_title" input="message_title_trix_input_message" class="trix-content" data-direct-upload-url="http://test.host/trails/active_storage/direct_uploads" data-blob-url-template="http://test.host/trails/active_storage/blobs/redirect/:signed_id/:filename">' +
        "</trix-editor>" +
        "</form>",
      tc.outputBuffer.toStr(),
    );
  });

  it("form with rich text area with value", async () => {
    await tc.formWith({ model: new Message(), scope: "message" }, (form: any) =>
      form.richTextarea("title", { value: "<h1>hello world</h1>" }),
    );

    tc.assertDomEqual(
      '<form action="/messages" accept-charset="UTF-8" method="post">' +
        '<input type="hidden" name="message[title]" id="message_title_trix_input_message" value="&lt;h1&gt;hello world&lt;/h1&gt;" autocomplete="off" />' +
        '<trix-editor id="message_title" input="message_title_trix_input_message" class="trix-content" data-direct-upload-url="http://test.host/trails/active_storage/direct_uploads" data-blob-url-template="http://test.host/trails/active_storage/blobs/redirect/:signed_id/:filename">' +
        "</trix-editor>" +
        "</form>",
      tc.outputBuffer.toStr(),
    );
  });

  it("form with rich text area with form attribute", async () => {
    await tc.formWith({ model: new Message(), scope: "message" }, (form: any) =>
      form.richTextarea("title", { form: "other_form" }),
    );

    tc.assertDomEqual(
      '<form action="/messages" accept-charset="UTF-8" method="post">' +
        '<input type="hidden" name="message[title]" id="message_title_trix_input_message" form="other_form" autocomplete="off" />' +
        '<trix-editor id="message_title" input="message_title_trix_input_message" class="trix-content" data-direct-upload-url="http://test.host/trails/active_storage/direct_uploads" data-blob-url-template="http://test.host/trails/active_storage/blobs/redirect/:signed_id/:filename">' +
        "</trix-editor>" +
        "</form>",
      tc.outputBuffer.toStr(),
    );
  });

  it("form with rich text area with data[direct_upload_url]", async () => {
    await tc.formWith({ model: new Message(), scope: "message" }, (form: any) =>
      form.richTextarea("content", {
        data: { direct_upload_url: "http://test.host/direct_uploads" },
      }),
    );

    tc.assertDomEqual(
      '<form action="/messages" accept-charset="UTF-8" method="post">' +
        '<input type="hidden" name="message[content]" id="message_content_trix_input_message" autocomplete="off" />' +
        '<trix-editor id="message_content" input="message_content_trix_input_message" class="trix-content" data-direct-upload-url="http://test.host/direct_uploads" data-blob-url-template="http://test.host/trails/active_storage/blobs/redirect/:signed_id/:filename">' +
        "</trix-editor>" +
        "</form>",
      tc.outputBuffer.toStr(),
    );
  });

  it("form with rich text area with data[blob_url_template]", async () => {
    await tc.formWith({ model: new Message(), scope: "message" }, (form: any) =>
      form.richTextarea("content", {
        data: { blob_url_template: "http://test.host/blobs/:signed_id/:filename" },
      }),
    );

    tc.assertDomEqual(
      '<form action="/messages" accept-charset="UTF-8" method="post">' +
        '<input type="hidden" name="message[content]" id="message_content_trix_input_message" autocomplete="off" />' +
        '<trix-editor id="message_content" input="message_content_trix_input_message" class="trix-content" data-direct-upload-url="http://test.host/trails/active_storage/direct_uploads" data-blob-url-template="http://test.host/blobs/:signed_id/:filename">' +
        "</trix-editor>" +
        "</form>",
      tc.outputBuffer.toStr(),
    );
  });
});
