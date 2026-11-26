import type {} from "@blazetrails/vitest-matchers";
import { describe, expect, it } from "vitest";

import { Loofah } from "../../../lib/loofah.js";
import { Scrub } from "../../../lib/loofah/html5/scrub.js";
import { ScrubBehavior } from "../../../lib/loofah/concerns.js";

describe("UnitHTML5Scrub", () => {
  describe(".scrub_css", () => {
    describe("hex values", () => {
      it("handles upper case", () => {
        expect(Scrub.scrubCss("background: #ABC012")).toBe("background:#ABC012;");
      });
      it("handles lower case", () => {
        expect(Scrub.scrubCss("background: #abc012")).toBe("background:#abc012;");
      });
    });

    describe("css functions", () => {
      it("allows safe functions", () => {
        expect(
          Scrub.scrubCss("background-color: linear-gradient(transparent 50%, #ffff66 50%);"),
        ).toBe("background-color:linear-gradient(transparent 50%, #ffff66 50%);");
      });

      it("disallows functions whose name only matches the safelist under Unicode case folding", () => {
        expect(Scrub.scrubCss("cursor:s\u212aew(1deg)")).toBeEmpty();
      });

      it("keeps the rest of a property whose unsafe function is dropped", () => {
        expect(Scrub.scrubCss("margin:0 clamp(1rem, 2vw, 2rem)")).toBe("margin:0;");
        expect(Scrub.scrubCss("border:1px solid color(display-p3 1 0 0)")).toBe(
          "border:1px solid;",
        );
      });

      it("keeps the rest of a property whose quote-containing string is dropped", () => {
        expect(Scrub.scrubCss(`font-family:"Rock 'n' Roll", serif`)).toBe("font-family:, serif;");
      });

      it("disallows unsafe functions", () => {
        expect(Scrub.scrubCss("background-color: haxxor-fun(transparent 50%, #ffff66 50%);")).toBe(
          "",
        );
      });

      it("allows safe functions in shorthand css properties", () => {
        expect(Scrub.scrubCss("background: linear-gradient(transparent 50%, #ffff66 50%);")).toBe(
          "background:linear-gradient(transparent 50%, #ffff66 50%);",
        );
      });
    });

    describe("property string values", () => {
      it("allows hypenated values", () => {
        let text = "font-family:'AvenirNext-Regular';";

        expect(Scrub.scrubCss(text)).toBe(text);

        text = 'font-family:"AvenirNext-Regular";';

        expect(Scrub.scrubCss(text)).toBe(text);
      });

      it("allows embedded spaces in values", () => {
        let text = "font-family:'Avenir Next';";

        expect(Scrub.scrubCss(text)).toBe(text);

        text = 'font-family:"Avenir Next";';

        expect(Scrub.scrubCss(text)).toBe(text);
      });

      it("does not allow values with embedded or irregular quotes", () => {
        expect(Scrub.scrubCss(`font-family:'AvenirNext"-Regular';`)).toBeEmpty();
        expect(Scrub.scrubCss(`font-family:"AvenirNext'-Regular";`)).toBeEmpty();

        expect(Scrub.scrubCss("font-family:'AvenirNext-Regular;")).toBeEmpty();
        expect(Scrub.scrubCss(`font-family:'AvenirNext-Regular";`)).toBeEmpty();

        expect(Scrub.scrubCss('font-family:"AvenirNext-Regular;')).toBeEmpty();
        expect(Scrub.scrubCss(`font-family:"AvenirNext-Regular';`)).toBeEmpty();
      });

      it("keeps whitespace around delimiters if it's already there", () => {
        expect(Scrub.scrubCss("font: 13px / 1.5 Arial , sans-serif;")).toBe(
          "font:13px / 1.5 Arial , sans-serif;",
        );
      });

      it("does not insert spaces around delimiters if they aren't already there", () => {
        expect(Scrub.scrubCss("font: 13px/1.5 Arial, sans-serif;")).toBe(
          "font:13px/1.5 Arial, sans-serif;",
        );
      });
    });

    describe("url()", () => {
      it("removes properties with a url()", () => {
        expect(Scrub.scrubCss("cursor:url(http://example.com/x.png),auto")).toBeEmpty();
      });

      it("does not decode escaped parentheses into a url()", () => {
        const cases: Record<string, string> = {
          "cursor:url\\28 http://example.com/x.png\\29,auto":
            "cursor:url\\28 http://example.com/x.png\\29,auto;",
          "cursor:url\\000028 http://example.com/x.png\\000029,auto":
            "cursor:url\\000028 http://example.com/x.png\\000029,auto;",
          "cursor:url\\(http://example.com/x.png\\),auto":
            "cursor:url\\(http://example.com/x.png\\),auto;",
          "list-style:url\\28 http://example.com/b.png\\29":
            "list-style:url\\28 http://example.com/b.png\\29;",
          "c\\75 rsor:url\\28 http://example.com/x.png\\29,auto":
            "cursor:url\\28 http://example.com/x.png\\29,auto;",
          'cursor:url\\28 "http://example.com/x.png"\\29,auto':
            'cursor:url\\28 "http://example.com/x.png"\\29,auto;',
          "cursor:url\\5c 28 http://example.com/x.png\\5c 29,auto":
            "cursor:url\\5c 28 http://example.com/x.png\\5c 29,auto;",
        };
        for (const [input, expected] of Object.entries(cases)) {
          expect(Scrub.scrubCss(input)).toBe(expected);
        }
      });

      it("does not decode escaped comments", () => {
        expect(
          Scrub.scrubCss("cursor:url\\2f\\2a\\2a\\2f\\28 http://example.com/x.png\\29,auto"),
        ).toBe("cursor:url\\2f\\2a\\2a\\2f\\28 http://example.com/x.png\\29,auto;");
        expect(Scrub.scrubCss("cursor:var\\2f\\2a\\2a\\2f\\28 --x\\29")).toBe(
          "cursor:var\\2f\\2a\\2a\\2f\\28 --x\\29;",
        );
      });

      it("does not decode escapes into unterminated blocks or strings", () => {
        expect(Scrub.scrubCss("cursor:\\28\\22")).toBe("cursor:\\28\\22;");
        expect(Scrub.scrubCss("cursor:\\22")).toBe("cursor:\\22;");
      });

      it("removes properties whose surviving tokens join into a comment", () => {
        expect(Scrub.scrubCss("cursor:url/(a)*/(http://example.com/x.png),auto")).toBeEmpty();
      });
    });

    describe("whitespace", () => {
      it("converts all whitespace to a single space except initial and final whitespace", () => {
        expect(Scrub.scrubCss("font: \n\t 12px \n\t Arial \n\t ;")).toBe("font:12px Arial;");
      });
    });

    describe("colors", () => {
      it("allows basic and extended colors", () => {
        let text = "background-color:blue;";

        expect(Scrub.scrubCss(text)).toBe(text);

        text = "background-color:brown;";

        expect(Scrub.scrubCss(text)).toBe(text);

        text = "background-color:lightblue;";

        expect(Scrub.scrubCss(text)).toBe(text);
      });

      it("does not allow non-colors", () => {
        const text = "background-color:blurple;";

        expect(Scrub.scrubCss(text)).toBeEmpty();
      });
    });
  });

  describe(".allowed_uri?", () => {
    // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either"
    it.skip("transcodes a string in another encoding before checking it", () => {});

    // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either"
    it.skip("rejects a string with an invalid byte sequence", () => {});

    // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either"
    it.skip("rejects a string that has no UTF-8 representation", () => {});

    // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either"
    it.skip("accepts ASCII-only strings in other ASCII-compatible encodings", () => {});

    it("allows http URIs", () => {
      expect(Scrub.isAllowedUri("http://example.com")).toBeTruthy();
    });

    it("allows https URIs", () => {
      expect(Scrub.isAllowedUri("https://example.com")).toBeTruthy();
    });

    it("allows mailto URIs", () => {
      expect(Scrub.isAllowedUri("mailto:foo@example.com")).toBeTruthy();
    });

    it("allows relative URIs", () => {
      expect(Scrub.isAllowedUri("/path/to/file")).toBeTruthy();
      expect(Scrub.isAllowedUri("path/to/file")).toBeTruthy();
      expect(Scrub.isAllowedUri("file.html")).toBeTruthy();
      expect(Scrub.isAllowedUri("#anchor")).toBeTruthy();
    });

    it("disallows javascript URIs", () => {
      expect(Scrub.isAllowedUri("javascript:alert(1)")).toBeFalsy();
    });

    it("disallows javascript URIs with capital letters", () => {
      expect(Scrub.isAllowedUri("JavaScript:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("JAVASCRIPT:alert(1)")).toBeFalsy();
    });

    it("disallows javascript URIs with HTML entities", () => {
      expect(Scrub.isAllowedUri("javascript&#58;alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#x3a;alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&colon;alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&amp;colon;alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&co\x00lon;alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&co\tlon;alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&co\nlon;alert(1)")).toBeFalsy();
    });

    it("disallows javascript URIs with control characters", () => {
      expect(Scrub.isAllowedUri("java\x00script:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("java\tscript:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("java\nscript:alert(1)")).toBeFalsy();
    });

    it("allows URIs with control characters inside character references, which browsers do not rejoin", () => {
      expect(Scrub.isAllowedUri("java&#1\x0015;cript:alert(1)")).toBeTruthy();
      expect(Scrub.isAllowedUri("java&#x\t73;cript:alert(1)")).toBeTruthy();
    });

    it("disallows javascript URIs with entity-encoded control characters splitting the scheme", () => {
      expect(Scrub.isAllowedUri("java&#13;script:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("java&#10;script:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("jav&#9;ascript:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("java&#x0d;script:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("java&#x0a;script:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("jav&#x09;ascript:alert(1)")).toBeFalsy();
    });

    it("disallows javascript URIs with named whitespace character references splitting the scheme", () => {
      expect(Scrub.isAllowedUri("java&Tab;script:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("java&NewLine;script:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("&Tab;javascript:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("&NewLine;javascript:alert(1)")).toBeFalsy();
    });

    it("disallows javascript URIs with named whitespace character references before the scheme separator", () => {
      expect(Scrub.isAllowedUri("javascript&Tab;:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&NewLine;:alert(1)")).toBeFalsy();
    });

    it("disallows javascript URIs combining named whitespace and named colon references", () => {
      expect(Scrub.isAllowedUri("java&Tab;script&colon;alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("java&NewLine;script&colon;alert(1)")).toBeFalsy();
    });

    it("disallows javascript URIs with double-encoded named whitespace character references", () => {
      expect(Scrub.isAllowedUri("java&amp;Tab;script:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("java&amp;NewLine;script:alert(1)")).toBeFalsy();
    });

    it("disallows javascript URIs where stripping an embedded control character reveals a named whitespace reference", () => {
      expect(Scrub.isAllowedUri("java&Ta&#0;b;script:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("java&New&#0;Line;script:alert(1)")).toBeFalsy();
    });

    it("allows wrong-cased named whitespace references, which browsers do not decode", () => {
      expect(Scrub.isAllowedUri("java&tab;script:alert(1)")).toBeTruthy();
      expect(Scrub.isAllowedUri("java&NEWLINE;script:alert(1)")).toBeTruthy();
    });

    it("does not mutate a frozen argument", () => {
      const frozenUri = "JAVA&Tab;SCRIPT&colon;alert(1)";

      expect(Object.isFrozen(frozenUri)).toBeTruthy();
      expect(Scrub.isAllowedUri(frozenUri)).toBeFalsy();
    });

    it("disallows javascript URIs whose scheme is separated by a semicolon-less numeric character reference colon", () => {
      expect(Scrub.isAllowedUri("javascript&#58alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#058alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#x3a(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#x03a(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#X3A(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("vbscript&#58msgbox(1)")).toBeFalsy();
    });

    it("disallows javascript URIs whose numeric character reference colon is padded with leading zeros", () => {
      expect(Scrub.isAllowedUri("javascript&#0000000000000000000058alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#x000000000000000003a(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("java&#00000000000000000009script:alert(1)")).toBeFalsy();
    });

    it("disallows javascript URIs whose scheme is split by a semicolon-less numeric character reference whitespace character", () => {
      expect(Scrub.isAllowedUri("java&#9script:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("java&#09script:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("java&#10script:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("java&#13script:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("java&#x9script:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("java&#X09script:alert(1)")).toBeFalsy();
    });

    it("disallows javascript URIs assembled from multiple numeric character references", () => {
      expect(Scrub.isAllowedUri("jav&#97script&#58alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#x3a&#9alert(1)")).toBeFalsy();
    });

    it("disallows javascript URIs whose semicolon-less numeric character reference colon is terminated by a stripped character", () => {
      expect(Scrub.isAllowedUri("javascript&#x3a alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#x3a\talert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#x3a\nalert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#x3a\ralert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#x3a\falert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#x3a\x00alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#x3a\x7falert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#x3a\u0080alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#x3a\u00a0alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#x3a\u0101alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#x3a`alert`")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#X3A alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("vbscript&#x3a alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#58 1,alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#58\t1,alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#58\u00a01,alert(1)")).toBeFalsy();
    });

    it("disallows javascript URIs whose semicolon-less numeric character reference colon is followed by a character reference", () => {
      expect(Scrub.isAllowedUri("javascript&#x3a&#x61;lert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#x3a&#97;lert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#58&#49;,alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#58&#x31;,alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#x3a&#x20;alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#x3a&Tab;alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("javascript&#x3a&NewLine;alert(1)")).toBeFalsy();
    });

    it("disallows javascript URIs whose scheme letter is a semicolon-less numeric character reference terminated by a stripped character", () => {
      expect(Scrub.isAllowedUri("&#x6a\tavascript:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("ja&#x76\tascript:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("java&#x73\ncript:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("&#x6a\ravascript:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("&#x76\tbscript:msgbox(1)")).toBeFalsy();
    });

    it("disallows javascript URIs whose scheme letter is a semicolon-less numeric character reference followed by a character reference", () => {
      expect(Scrub.isAllowedUri("&#x6a&#x61;vascript:alert(1)")).toBeFalsy();
      expect(Scrub.isAllowedUri("java&#x73&#99;ript:alert(1)")).toBeFalsy();
    });

    it("allows URIs whose numeric character references do not decode to a scheme colon", () => {
      expect(Scrub.isAllowedUri("javascript&#581alert(1)")).toBeTruthy();
      expect(Scrub.isAllowedUri("javascript&#x3aalert(1)")).toBeTruthy();
    });

    it("checks the mediatype of data URIs whose scheme is separated by a numeric character reference", () => {
      expect(Scrub.isAllowedUri("data&#58text/html,<script>alert(1)</script>")).toBeFalsy();
      expect(Scrub.isAllowedUri("data&#x3aimage/png;base64,iVBORw0KGgo")).toBeTruthy();
    });

    it("checks the mediatype of data URIs whose mediatype is assembled by a numeric character reference", () => {
      expect(Scrub.isAllowedUri("data:text&#x2fhtml,<script>alert(1)</script>")).toBeFalsy();
      expect(Scrub.isAllowedUri("data:image&#x2fpng;base64,iVBORw0KGgo")).toBeTruthy();
    });

    it("checks the mediatype of data URIs whose mediatype is assembled by a named solidus character reference", () => {
      expect(Scrub.isAllowedUri("data:text&sol;html,<script>alert(1)</script>")).toBeFalsy();
      expect(
        Scrub.isAllowedUri("data:text&sol;html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="),
      ).toBeFalsy();
      expect(Scrub.isAllowedUri("data:image&sol;png;base64,iVBORw0KGgo")).toBeTruthy();
    });

    it("checks the mediatype of data URIs whose scheme and mediatype are both assembled by named references", () => {
      expect(Scrub.isAllowedUri("data&colon;text&sol;html,<script>alert(1)</script>")).toBeFalsy();
      expect(Scrub.isAllowedUri("data&colon;image&sol;png;base64,iVBORw0KGgo")).toBeTruthy();
    });

    it("checks the mediatype of data URIs with a double-encoded named solidus character reference", () => {
      expect(Scrub.isAllowedUri("data:text&amp;sol;html,<script>alert(1)</script>")).toBeFalsy();
    });

    it("checks the mediatype of data URIs where stripping an embedded control character reveals a named solidus reference", () => {
      expect(Scrub.isAllowedUri("data:text&s&#0;ol;html,<script>alert(1)</script>")).toBeFalsy();
    });

    it("checks the mediatype of data URIs where removing a named whitespace reference reveals a named solidus reference", () => {
      expect(Scrub.isAllowedUri("data:text&s&Tab;ol;html,<script>alert(1)</script>")).toBeFalsy();
      expect(
        Scrub.isAllowedUri("data:text&s&NewLine;ol;html,<script>alert(1)</script>"),
      ).toBeFalsy();
    });

    it("allows wrong-cased named solidus references, which browsers do not decode", () => {
      expect(Scrub.isAllowedUri("data:text&SOL;html,<script>alert(1)</script>")).toBeTruthy();
    });

    it("disallows vbscript URIs", () => {
      expect(Scrub.isAllowedUri("vbscript:msgbox(1)")).toBeFalsy();
    });

    it("allows data URIs with safe mediatypes", () => {
      expect(Scrub.isAllowedUri("data:image/gif;base64,R0lGODlh")).toBeTruthy();
      expect(Scrub.isAllowedUri("data:image/png;base64,iVBORw0KGgo")).toBeTruthy();
      expect(Scrub.isAllowedUri("data:image/jpeg;base64,/9j/4AAQ")).toBeTruthy();
      expect(Scrub.isAllowedUri("data:text/plain,hello")).toBeTruthy();
      expect(Scrub.isAllowedUri("data:text/css,.foo{}")).toBeTruthy();
    });

    it("disallows data URIs with unsafe mediatypes", () => {
      expect(Scrub.isAllowedUri("data:text/html,<script>alert(1)</script>")).toBeFalsy();
      expect(
        Scrub.isAllowedUri("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="),
      ).toBeFalsy();
      expect(Scrub.isAllowedUri("data:image/svg+xml,<svg onload=alert(1)>")).toBeFalsy();
      expect(Scrub.isAllowedUri("data:foo")).toBeFalsy();
    });

    it("disallows data URIs with a literal &#x70 in the mediatype", () => {
      expect(Scrub.isAllowedUri("data:&#x70text/html,<script>alert(1)</script>")).toBeFalsy();
      expect(Scrub.isAllowedUri("data:image/png&#x70,payload")).toBeFalsy();
    });

    it("treats a data URI with a malformed mediatype as text/plain", () => {
      expect(Scrub.isAllowedUri("data::text/html,<script>alert(1)</script>")).toBeTruthy();
      expect(Scrub.isAllowedUri("data:image/png:text/html,<script>alert(1)</script>")).toBeTruthy();
    });

    it("allows data URIs with an omitted mediatype, which defaults to text/plain", () => {
      expect(Scrub.isAllowedUri("data:,hello")).toBeTruthy();
      expect(Scrub.isAllowedUri("data:;base64,aGVsbG8=")).toBeTruthy();
      expect(Scrub.isAllowedUri("data:;charset=utf-8,hello")).toBeTruthy();
    });

    it("disallows data URIs with no mediatype and no data", () => {
      expect(Scrub.isAllowedUri("data:")).toBeFalsy();
    });
  });

  describe(".data_uri_mediatype", () => {
    it("returns the mediatype of a valid data URI", () => {
      expect(Scrub.dataUriMediatype("data:image/png,x")).toBe("image/png");
      expect(Scrub.dataUriMediatype("data:text/html,x")).toBe("text/html");
      expect(Scrub.dataUriMediatype("data:image/svg+xml,x")).toBe("image/svg+xml");
    });

    it("returns the type/subtype without parameters", () => {
      expect(Scrub.dataUriMediatype("data:text/plain;charset=utf-8,x")).toBe("text/plain");
    });

    it("ignores the base64 flag", () => {
      expect(Scrub.dataUriMediatype("data:image/png;base64,x")).toBe("image/png");
      expect(Scrub.dataUriMediatype("data:text/plain;charset=utf-8;base64,x")).toBe("text/plain");
    });

    it("defaults an omitted mediatype to text/plain", () => {
      expect(Scrub.dataUriMediatype("data:,x")).toBe("text/plain");
      expect(Scrub.dataUriMediatype("data:;base64,x")).toBe("text/plain");
      expect(Scrub.dataUriMediatype("data:;charset=utf-8,x")).toBe("text/plain");
    });

    it("falls back to text/plain for a malformed mediatype", () => {
      expect(Scrub.dataUriMediatype("data::text/html,x")).toBe("text/plain");
      expect(Scrub.dataUriMediatype("data:image/png:text/html,x")).toBe("text/plain");
      expect(Scrub.dataUriMediatype("data:foo,x")).toBe("text/plain");
      expect(Scrub.dataUriMediatype("data:image/,x")).toBe("text/plain");
      expect(Scrub.dataUriMediatype("data:/plain,x")).toBe("text/plain");
    });

    it("does not treat a partial entity match as a separator", () => {
      expect(Scrub.dataUriMediatype("data:image/png&#x3a0,payload")).toBe("image/png&#x3a0");
      expect(Scrub.dataUriMediatype("data:image/pngΠ,payload")).toBe("text/plain");
    });

    it("strips whitespace around the mediatype", () => {
      expect(Scrub.dataUriMediatype("data: text/plain ,x")).toBe("text/plain");
    });

    it("splits on the first comma", () => {
      expect(Scrub.dataUriMediatype("data:text/plain,a,b,c")).toBe("text/plain");
    });

    it("returns nil when the required comma is absent", () => {
      expect(Scrub.dataUriMediatype("data:")).toBeNull();
      expect(Scrub.dataUriMediatype("data:image/png")).toBeNull();
      expect(Scrub.dataUriMediatype("data:text/plain")).toBeNull();
    });
  });

  describe(".prefixed_attribute_name", () => {
    it("qualifies a namespaced attribute with its prefix", () => {
      const node = Loofah.html4Fragment(`<svg><use xlink:href="#p"></use></svg>`).atCss("use")!;

      expect(node.attributeNodes.map((a) => Scrub.prefixedAttributeName(a))).toEqual([
        "xlink:href",
      ]);
    });

    it("uses the bare name when there is no namespace", () => {
      const node = Loofah.html4Fragment(`<a href="#p"></a>`).atCss("a")!;

      expect(node.attributeNodes.map((a) => Scrub.prefixedAttributeName(a))).toEqual(["href"]);
    });
  });

  describe(".scrub_attribute_value", () => {
    it("reports that a removed uri attribute needs no further scrubbing", () => {
      const node = Loofah.html4Fragment(`<a href="javascript:alert(1)"></a>`).atCss("a")!;

      expect(Scrub.scrubAttributeValue(node, node.attributeNodes[0])).toBeTruthy();
      expect(node.attributeNodes).toBeEmpty();
    });

    it("reports that a permitted uri attribute still needs scrubbing", () => {
      const node = Loofah.html4Fragment(`<a href="http://example.com/"></a>`).atCss("a")!;

      expect(Scrub.scrubAttributeValue(node, node.attributeNodes[0])).toBeFalsy();
      expect(node.get("href")).toEqual("http://example.com/");
    });

    it("removes an svg href that is not a local reference", () => {
      const node = Loofah.html4Fragment(`<svg><use href="http://bad.com/x"></use></svg>`).atCss(
        "use",
      )!;

      expect(Scrub.scrubAttributeValue(node, node.attributeNodes[0])).toBeFalsy();
      expect(node.attributeNodes).toBeEmpty();
    });

    it("keeps an svg href that is a local reference", () => {
      const node = Loofah.html4Fragment(`<svg><use href="#p"></use></svg>`).atCss("use")!;

      expect(Scrub.scrubAttributeValue(node, node.attributeNodes[0])).toBeFalsy();
      expect(node.get("href")).toEqual("#p");
    });
  });

  describe(".scrub_attributes", () => {
    it("keeps scrubbing the remaining attributes after removing one", () => {
      const fragment = Loofah.html4Fragment(
        `<svg><use href="http://bad.com/x" fill="url(http://bad.com/) #fff"></use></svg>`,
      );

      expect(ScrubBehavior.Node.scrubBang(fragment, "strip").toString()).toEqual(
        `<svg><use fill="#fff"></use></svg>`,
      );
    });

    it("keeps scrubbing the remaining attributes after a uri attribute is removed", () => {
      const fragment = Loofah.html4Fragment(
        `<svg><use href="javascript:alert(1)" fill="url(http://bad.com/) #fff"></use></svg>`,
      );

      expect(ScrubBehavior.Node.scrubBang(fragment, "strip").toString()).toEqual(
        `<svg><use fill="#fff"></use></svg>`,
      );
    });
  });
});
