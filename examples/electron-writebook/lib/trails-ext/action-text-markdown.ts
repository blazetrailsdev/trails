import {
  days,
  htmlSafe,
  mattrAccessor,
  onLoad,
  runLoadHooks,
  type SafeBuffer,
} from "@blazetrails/activesupport";
import { ActionText } from "@blazetrails/actiontext";
import { Record } from "@blazetrails/actiontext/record.js";
import { constSet } from "@blazetrails/ruby-compat";
import { Redcarpet } from "../redcarpet.ts";

type Renderer = Redcarpet.Markdown | { call(): Redcarpet.Markdown };

export class Markdown extends Record {
  static UPLOADS_SIGNED_ID_PURPOSE = "markdown_uploads";
  static UPLOADS_SIGNED_ID_EXPIRY = days(1);

  static DEFAULT_RENDERER_OPTIONS = {
    filterHtml: false,
  };

  static DEFAULT_MARKDOWN_EXTENSIONS = {
    autolink: true,
    highlight: true,
    noIntraEmphasis: true,
    fencedCodeBlocks: true,
    laxSpacing: true,
    strikethrough: true,
    tables: true,
  };

  declare static renderer: Renderer;
  declare content: string;
  declare name: string;

  static {
    mattrAccessor.call(this, "renderer", {
      default: new Redcarpet.Markdown(
        new Redcarpet.Render.HTML(Markdown.DEFAULT_RENDERER_OPTIONS),
        Markdown.DEFAULT_MARKDOWN_EXTENSIONS,
      ),
    });

    this.belongsTo("record", { polymorphic: true, touch: true });
  }

  toHtml(): SafeBuffer {
    const renderer = Markdown.renderer;
    return htmlSafe(("call" in renderer ? renderer.call() : renderer).render(this.content));
  }
}

constSet(ActionText, "Markdown", Markdown);

onLoad("active_storage_attachment", function () {
  Markdown.hasManyAttached("uploads");
});

runLoadHooks("action_text_markdown", Markdown);
