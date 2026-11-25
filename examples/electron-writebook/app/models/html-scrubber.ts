import { PermitScrubber, Loofah, HTML } from "@blazetrails/html-sanitizer";
import { EmbedProvider } from "./embed-provider.ts";

type Node = Parameters<PermitScrubber["scrub"]>[0];

export class HtmlScrubber extends PermitScrubber {
  static LIGHTBOX_ACTION = "lightbox#open:prevent";

  static MEDIA_ATTRIBUTES = Object.freeze([
    "controls",
    "autoplay",
    "muted",
    "playsinline",
    "allowfullscreen",
    "frameborder",
    "loading",
    "open",
    "reversed",
  ]);

  static POLICY_VERSION = 2;

  static cacheVersion(): string {
    return `${HtmlScrubber.POLICY_VERSION}-${EmbedProvider.cacheVersion()}`;
  }

  constructor() {
    super();
    this.tags = [
      ...HTML.WhiteListSanitizer.allowedTags,
      ...[
        "audio",
        "details",
        "summary",
        "iframe",
        "options",
        "table",
        "tbody",
        "td",
        "th",
        "thead",
        "tr",
        "video",
        "source",
        "mark",
      ],
    ];
    this.attributes = [
      ...Loofah.HTML5.SafeList.ACCEPTABLE_ATTRIBUTES,
      ...HtmlScrubber.MEDIA_ATTRIBUTES,
      "data-action",
    ];
  }

  override scrub(node: Node): unknown {
    const result = super.scrub(node);
    if (node.isElement()) this.removeForeignActions(node);
    return result;
  }

  protected override isKeepNode(node: Node): boolean {
    if (node.name === "iframe" && EmbedProvider.isConfigured()) {
      return EmbedProvider.isAllows(node.get("src"));
    } else {
      return super.isKeepNode(node);
    }
  }

  protected override scrubAttributes(node: Node): void {
    if (node.name === "iframe" && EmbedProvider.isConfigured()) {
      const permitted = EmbedProvider.match(node.get("src"))?.attributes ?? [];
      for (const attr of node.attributeNodes) {
        if (!permitted.includes(attr.name)) node.removeAttribute(attr.name);
      }
    } else {
      super.scrubAttributes(node);
    }
  }

  protected override isScrubAttribute(name: string): boolean {
    if (name.startsWith("aria-") || name === "role") return false;
    return super.isScrubAttribute(name);
  }

  private removeForeignActions(node: Node): void {
    for (const attr of node.attributeNodes) {
      if (attr.name !== "data-action") continue;
      if (!(node.name === "a" && attr.value === HtmlScrubber.LIGHTBOX_ACTION)) attr.remove();
    }
  }
}
