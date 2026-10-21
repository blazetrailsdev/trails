import { describe, it, expect } from "vitest";

import { Base } from "../base.js";
import { StreamingBuffer } from "../buffers.js";
import { LookupContext } from "../lookup-context.js";
import { pictureTag } from "./asset-tag-helper.js";
import { javascriptTag } from "./javascript-helper.js";
import { FixtureResolver } from "../testing/resolvers.js";

function makeView(): Base {
  const lookupContext = new LookupContext(null, {}, ["test"]);
  lookupContext.appendViewPaths([new FixtureResolver({})]);
  return new (Base.withEmptyTemplateCache())(lookupContext, {}, null);
}

const plain = (view: Base) => async () => {
  view.outputBuffer!.safeAppend(await view.render({ plain: "<b>rendered</b>" }));
};

describe("capture's callers await an async block", () => {
  it("content_tag", async () => {
    const view = makeView();
    expect(String(await view.contentTag("div", { class: "x" }, null, undefined, plain(view)))).toBe(
      '<div class="x"><b>rendered</b></div>',
    );
  });

  it("tag builder", async () => {
    const view = makeView();
    expect(
      String(
        await (view.tag() as unknown as { div(block: () => unknown): unknown }).div(plain(view)),
      ),
    ).toBe("<div><b>rendered</b></div>");
  });

  it("link_to", async () => {
    const view = makeView();
    expect(String(await view.linkTo("/foo", {}, null, plain(view)))).toBe(
      '<a href="/foo"><b>rendered</b></a>',
    );
  });

  it("button_tag", async () => {
    const view = makeView();
    expect(String(await view.buttonTag({ type: "button" }, null, plain(view)))).toBe(
      '<button name="button" type="button"><b>rendered</b></button>',
    );
  });

  it("label_tag", async () => {
    const view = makeView();
    expect(String(await view.labelTag("title", null, {}, plain(view)))).toBe(
      '<label for="title"><b>rendered</b></label>',
    );
  });

  it("field_set_tag", async () => {
    const view = makeView();
    expect(String(await view.fieldSetTag("Legend", null, plain(view)))).toBe(
      "<fieldset><legend>Legend</legend><b>rendered</b></fieldset>",
    );
  });

  it("fields", async () => {
    const view = makeView();
    expect(String(await view.fields("post", {}, plain(view)))).toBe("<b>rendered</b>");
  });

  it("form_with", async () => {
    const view = makeView();
    const html = String(await view.formWith({ url: "/posts" }, plain(view)));
    expect(html).toContain("<b>rendered</b></form>");
  });

  it("javascript_tag", async () => {
    const view = makeView();
    expect(String(await javascriptTag.call(view as never, null, {}, plain(view)))).toContain(
      "<b>rendered</b>\n//]]>\n</script>",
    );
  });

  it("picture_tag", async () => {
    const view = makeView();
    expect(String(await pictureTag.call(view as never, plain(view)))).toBe(
      "<picture><b>rendered</b></picture>",
    );
  });

  it("FormBuilder#label and #button", async () => {
    const view = makeView();
    const html = String(
      await view.formWith({ url: "/posts", scope: "post" }, async (f) => {
        view.outputBuffer!.safeAppend(await f.label("title", null, {}, plain(view)));
        view.outputBuffer!.safeAppend(await f.button(null, {}, plain(view)));
      }),
    );
    expect(html).toContain("<label><b>rendered</b></label>");
    expect(html).toContain('type="submit"><b>rendered</b></button>');
  });

  it("StreamingBuffer#capture awaits an async block", async () => {
    const written: string[] = [];
    const buffer = new StreamingBuffer((value) => written.push(value));
    const captured = await buffer.capture(async () => {
      buffer.append(await Promise.resolve("<i>"));
      buffer.safeAppend("<b>");
    });
    expect(String(captured)).toBe("&lt;i&gt;<b>");
    expect(written).toEqual([]);
    buffer.append("after");
    expect(written).toEqual(["after"]);
  });
});
