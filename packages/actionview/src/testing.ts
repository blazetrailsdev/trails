import { mattrAccessor } from "@blazetrails/activesupport";
import { ArgumentError, NotImplementedError, rbInspect } from "@blazetrails/ruby-compat";
import { HTML5 } from "@blazetrails/nokogiri";
import * as Nokogiri from "@blazetrails/nokogiri";

type HtmlDocument = (typeof HTML5)["Document"];
type HtmlDocumentFragment = (typeof HTML5)["DocumentFragment"];

export const Testing = {} as {
  defaultHtmlVersion: string;
  isHtml5Support(): boolean;
  htmlDocument(options?: { htmlVersion?: string | null }): HtmlDocument;
  htmlDocumentFragment(options?: { htmlVersion?: string | null }): HtmlDocumentFragment;
};

mattrAccessor.call(Testing, "defaultHtmlVersion", { default: ":html5" });

Testing.isHtml5Support = function isHtml5Support(): boolean {
  return "HTML5" in Nokogiri;
};

Testing.htmlDocument = function htmlDocument({
  htmlVersion = null,
}: { htmlVersion?: string | null } = {}): HtmlDocument {
  const parserClasses: Record<string, HtmlDocument | undefined> = { html4: undefined };
  if (Testing.isHtml5Support()) parserClasses.html5 = HTML5.Document;

  return chooseHtmlParser(parserClasses, { htmlVersion });
};

Testing.htmlDocumentFragment = function htmlDocumentFragment({
  htmlVersion = null,
}: { htmlVersion?: string | null } = {}): HtmlDocumentFragment {
  const parserClasses: Record<string, HtmlDocumentFragment | undefined> = { html4: undefined };
  if (Testing.isHtml5Support()) parserClasses.html5 = HTML5.DocumentFragment;

  return chooseHtmlParser(parserClasses, { htmlVersion });
};

function chooseHtmlParser<T>(
  parserClasses: Record<string, T | undefined>,
  { htmlVersion = null }: { htmlVersion?: string | null } = {},
): T {
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
