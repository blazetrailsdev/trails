import { onLoad } from "@blazetrails/activesupport";
import { Markdown } from "../../lib/trails-ext/action-text-markdown.ts";

onLoad("action_text_markdown", async function () {
  const { MarkdownRenderer } = await import("../../lib/markdown-renderer.ts");
  Markdown.renderer = { call: () => MarkdownRenderer.build() };
});
