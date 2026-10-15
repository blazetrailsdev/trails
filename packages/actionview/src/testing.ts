import { mattrAccessor } from "@blazetrails/activesupport";
import { ArgumentError, NotImplementedError, rbInspect } from "@blazetrails/ruby-compat";
import { HTML5 } from "@blazetrails/nokogiri";
import * as Nokogiri from "@blazetrails/nokogiri";

type HtmlDocumentFragment = (typeof HTML5)["DocumentFragment"];

export const Testing = {} as {
  defaultHtmlVersion: string;
  isHtml5Support(): boolean;
  htmlDocumentFragment(options?: { htmlVersion?: string | null }): HtmlDocumentFragment;
};

mattrAccessor.call(Testing, "defaultHtmlVersion", { default: ":html4" });

Testing.isHtml5Support = function isHtml5Support(): boolean {
  return "HTML5" in Nokogiri;
};

Testing.htmlDocumentFragment = function htmlDocumentFragment({
  htmlVersion = null,
}: { htmlVersion?: string | null } = {}): HtmlDocumentFragment {
  const parserClasses: Record<string, HtmlDocumentFragment | undefined> = { html4: undefined };
  if (Testing.isHtml5Support()) parserClasses.html5 = HTML5.DocumentFragment;

  return chooseHtmlParser(parserClasses, { htmlVersion });
};

/** @inventedArm if — CONVERGEABLE dom-assertions-fragment-parses-with-nokogiri-html4 */
function chooseHtmlParser(
  parserClasses: Record<string, HtmlDocumentFragment | undefined>,
  { htmlVersion = null }: { htmlVersion?: string | null } = {},
): HtmlDocumentFragment {
  htmlVersion ||= Testing.defaultHtmlVersion;

  switch (htmlVersion) {
    case ":html4":
      if (parserClasses.html4 === undefined) {
        // @nie disposition=TODO
        throw new NotImplementedError("html4 parser is not supported on this platform");
      }
      return parserClasses.html4;
    case ":html5":
      if (!Testing.isHtml5Support()) {
        // @nie disposition=TODO
        throw new NotImplementedError("html5 parser is not supported on this platform");
      }
      return parserClasses.html5!;
    default:
      throw new ArgumentError(
        `html_version must be :html4 or :html5, received ${rbInspect(htmlVersion)}`,
      );
  }
}
