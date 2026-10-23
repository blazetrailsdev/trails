import { describe, expect, it } from "vitest";

import { xpathFor } from "../css.js";
import { BuiltinsConfig, DoctypeConfig, XPathVisitor } from "./xpath-visitor.js";

describe("Nokogiri::CSS::XPathVisitor", () => {
  function assertXpath(
    expecteds: string | string[],
    inputSelectorList: string,
    config: ConstructorParameters<typeof XPathVisitor>[0] = {},
  ) {
    const visitor = new XPathVisitor(config);
    const actuals = xpathFor(inputSelectorList, { visitor, cache: false });

    [expecteds].flat().forEach((expected, i) => {
      expect(actuals[i]).toEqual(expected);
    });
  }

  describe(".new", () => {
    it("accepts some config parameters", () => {
      for (const builtins of BuiltinsConfig.VALUES) {
        expect(new XPathVisitor({ builtins }).builtins).toEqual(builtins);
      }
      expect(() => new XPathVisitor({ builtins: "not_valid" as never })).toThrow("Invalid values");
      for (const doctype of DoctypeConfig.VALUES) {
        expect(new XPathVisitor({ doctype }).doctype).toEqual(doctype);
      }
      expect(() => new XPathVisitor({ doctype: "not_valid" as never })).toThrow("Invalid values");

      expect(new XPathVisitor({ namespaces: { foo: "bar" } }).namespaces).toEqual({ foo: "bar" });

      expect(new XPathVisitor({ prefix: "xxx" }).prefix).toEqual("xxx");
    });
  });

  describe("#config", () => {
    it("exposes its configuration", () => {
      const visitor = new XPathVisitor();
      const expected = { builtins: "never", doctype: "xml", prefix: "//", namespaces: null };
      expect(visitor.config()).toEqual(expected);

      expect(visitor.namespaces).toBeNull();
      expect(visitor.prefix).toEqual("//");
    });
  });

  describe("custom pseudo-classes via XPathVisitor methods", () => {
    it("pseudo-class functions", () => {
      const visitor = new (class extends XPathVisitor {
        called = false;

        visitFunctionAaron() {
          this.called = true;
          return "aaron() = 1";
        }
      })();

      expect(xpathFor("a:aaron()", { visitor, cache: false })).toEqual(["//a[aaron() = 1]"]);
      expect(visitor.called).toBe(true);
    });

    it("pseudo-classes selectors", () => {
      const visitor = new (class extends XPathVisitor {
        called = false;

        visitPseudoClassAaron() {
          this.called = true;
          return "aaron() = 1";
        }
      })();

      expect(xpathFor("a:aaron", { visitor, cache: false })).toEqual(["//a[aaron() = 1]"]);
      expect(visitor.called).toBe(true);
    });
  });

  describe("namespaces", () => {
    const ns = { xmlns: "http://default.example.com/", hoge: "http://hoge.example.com/" };

    it("default namespace is applied to elements but not attributes", () => {
      expect(xpathFor("a[class='bar']", { ns, cache: false })).toEqual(["//xmlns:a[@class='bar']"]);
    });

    it("default namespace is not applied to wildcard selectors", () => {
      expect(xpathFor("a *", { ns, cache: false })).toEqual(["//xmlns:a//*"]);
    });

    it("intentionally-empty namespace omits the default xmlns", () => {
      expect(xpathFor("|a", { ns, cache: false })).toEqual(["//a"]);
    });

    it("explicit namespaces are applied to attributes", () => {
      expect(xpathFor("a[hoge|class='bar']", { ns, cache: false })).toEqual([
        "//xmlns:a[@hoge:class='bar']",
      ]);
    });
  });

  describe("doctype:html5 builtins:always without the wildcard-namespaces patch", () => {
    const config = { doctype: "html5", builtins: "always" } as const;

    it("matches on the element's local-name, ignoring namespaces", () => {
      assertXpath("//*[nokogiri-builtin:local-name-is('foo')]", "foo", config);
    });

    it("avoids the wildcard when using attribute selectors (extended-syntax)", () => {
      assertXpath("//*[nokogiri-builtin:local-name-is('a')]/@href", "a/@href", config);
    });
  });

  describe("selectors", () => {
    it("* universal", () => {
      assertXpath("//*", "*");
    });
    it("type", () => {
      assertXpath("//x", "x");
    });
    it("type with namespaces", () => {
      assertXpath("//aaron:a", "aaron|a");
      assertXpath("//a", "|a");
    });
    it(". class", () => {
      assertXpath("//*[contains(concat(' ',normalize-space(@class),' '),' awesome ')]", ".awesome");
      assertXpath(
        "//foo[contains(concat(' ',normalize-space(@class),' '),' awesome ')]",
        "foo.awesome",
      );
      assertXpath(
        "//foo//*[contains(concat(' ',normalize-space(@class),' '),' awesome ')]",
        "foo .awesome",
      );
      assertXpath(
        "//foo//*[contains(concat(' ',normalize-space(@class),' '),' awe.some ')]",
        "foo .awe\\.some",
      );
      assertXpath(
        "//*[contains(concat(' ',normalize-space(@class),' '),' a ') and contains(concat(' ',normalize-space(@class),' '),' b ')]",
        ".a.b",
      );
      assertXpath(
        "//*[contains(concat(' ',normalize-space(@class),' '),' pastoral ')]",
        "*.pastoral",
      );
    });
    describe("namespaces", () => {
      it("basic mechanics", () => {
        assertXpath("//a[@flavorjones:href]", "a[flavorjones|href]");
        assertXpath("//a[@href]", "a[|href]");
        assertXpath("//*[@flavorjones:href]", "*[flavorjones|href]");
      });
    });
    describe("attribute", () => {
      it("basic mechanics", () => {
        assertXpath("//h1[@a='Tender Lovemaking']", "h1[a='Tender Lovemaking']");
        assertXpath("//h1[@a]", "h1[a]");
        assertXpath("//h1[@a='gnewline\\n']", "h1[a='\\gnew\\\nline\\\\n']");
        assertXpath("//h1[@a='test']", "h1[a=\\te\\st]");
      });
      it("#id escaping", () => {
        assertXpath("//*[@id='foo']", "#foo");
        assertXpath("//*[@id='escape:needed,']", "#escape\\:needed\\,");
        assertXpath("//*[@id='escape:needed,']", "#escape\\3Aneeded\\,");
        assertXpath("//*[@id='escape:needed,']", "#escape\\3A needed\\2C");
        assertXpath("//*[@id='escape:needed']", "#escape\\00003Aneeded");
      });
      it("parses leading @ (extended-syntax)", () => {
        assertXpath("//a[@id='Boing']", "a[@id='Boing']");
        assertXpath("//a[@id='Boing']", "a[@id = 'Boing']");
        assertXpath("//a[@id='Boing']//div", "a[@id='Boing'] div");
      });
      it("rhs with quotes", () => {
        assertXpath('//h1[@a="\'"]', 'h1[a="\'"]');
        assertXpath('//h1[@a=concat("\'","")]', "h1[a='\\'']");
        assertXpath('//h1[@a=concat("",\'"\',"\'","")]', "h1[a='\"\\'']");
      });
      it("rhs is number or string", () => {
        assertXpath("//img[@width='200']", "img[width='200']");
        assertXpath("//img[@width='200']", "img[width=200]");
      });
      it("bare", () => {
        assertXpath("//*[@a]//*[@b]", "[a] [b]");
      });
      it("|=", () => {
        assertXpath(
          "//a[@class='bar' or starts-with(@class,concat('bar','-'))]",
          "a[class|='bar']",
        );
        assertXpath(
          "//a[@class='bar' or starts-with(@class,concat('bar','-'))]",
          "a[class |= 'bar']",
        );
        assertXpath("//a[@id='Boing' or starts-with(@id,concat('Boing','-'))]", "a[id|='Boing']");
      });
      it("|= (extended-syntax)", () => {
        assertXpath(
          "//a[@class='bar' or starts-with(@class,concat('bar','-'))]",
          "a[@class|='bar']",
        );
        assertXpath(
          "//a[@class='bar' or starts-with(@class,concat('bar','-'))]",
          "a[@class |= 'bar']",
        );
        assertXpath("//a[@id='Boing' or starts-with(@id,concat('Boing','-'))]", "a[@id|='Boing']");
      });
      it("~=", () => {
        assertXpath(
          "//a[contains(concat(' ',normalize-space(@class),' '),' bar ')]",
          "a[class~='bar']",
        );
        assertXpath(
          "//a[contains(concat(' ',normalize-space(@class),' '),' bar ')]",
          "a[class ~= 'bar']",
        );
        assertXpath(
          "//a[contains(concat(' ',normalize-space(@class),' '),' bar ')]",
          "a[class~=bar]",
        );
        assertXpath(
          "//a[contains(concat(' ',normalize-space(@class),' '),' bar ')]",
          'a[class~="bar"]',
        );
        assertXpath(
          "//a[contains(concat(' ',normalize-space(@data-words),' '),' bar ')]",
          'a[data-words~="bar"]',
        );
      });
      it("~= (extended-syntax)", () => {
        assertXpath(
          "//a[contains(concat(' ',normalize-space(@class),' '),' bar ')]",
          "a[@class~='bar']",
        );
        assertXpath(
          "//a[contains(concat(' ',normalize-space(@class),' '),' bar ')]",
          "a[@class ~= 'bar']",
        );
        assertXpath(
          "//a[contains(concat(' ',normalize-space(@class),' '),' bar ')]",
          "a[@class~=bar]",
        );
        assertXpath(
          "//a[contains(concat(' ',normalize-space(@class),' '),' bar ')]",
          'a[@class~="bar"]',
        );
        assertXpath(
          "//a[contains(concat(' ',normalize-space(@data-words),' '),' bar ')]",
          'a[@data-words~="bar"]',
        );
      });
      it("^=", () => {
        assertXpath("//a[starts-with(@id,'Boing')]", "a[id^='Boing']");
        assertXpath("//a[starts-with(@id,'Boing')]", "a[id ^= 'Boing']");
      });
      it("$=", () => {
        assertXpath(
          "//a[substring(@id,string-length(@id)-string-length('Boing')+1,string-length('Boing'))='Boing']",
          "a[id$='Boing']",
        );
        assertXpath(
          "//a[substring(@id,string-length(@id)-string-length('Boing')+1,string-length('Boing'))='Boing']",
          "a[id $= 'Boing']",
        );
      });
      it("*=", () => {
        assertXpath("//a[contains(@id,'Boing')]", "a[id*='Boing']");
        assertXpath("//a[contains(@id,'Boing')]", "a[id *= 'Boing']");
      });
      it("!= (extended-syntax)", () => {
        assertXpath("//a[@id!='Boing']", "a[id!='Boing']");
        assertXpath("//a[@id!='Boing']", "a[id != 'Boing']");
      });
    });
  });
  describe("pseudo-classes", () => {
    it(":first-of-type", () => {
      assertXpath("//a[position()=1]", "a:first-of-type()");
      assertXpath("//a[position()=1]", "a:first-of-type");
      assertXpath(
        "//a[contains(concat(' ',normalize-space(@class),' '),' b ')][position()=1]",
        "a.b:first-of-type",
      );
    });
    it(":nth-of-type", () => {
      assertXpath("//a[position()=99]", "a:nth-of-type(99)");
      assertXpath(
        "//a[contains(concat(' ',normalize-space(@class),' '),' b ')][position()=99]",
        "a.b:nth-of-type(99)",
      );
    });
    it(":last-of-type", () => {
      assertXpath("//a[position()=last()]", "a:last-of-type()");
      assertXpath("//a[position()=last()]", "a:last-of-type");
      assertXpath(
        "//a[contains(concat(' ',normalize-space(@class),' '),' b ')][position()=last()]",
        "a.b:last-of-type",
      );
    });
    it(":nth-last-of-type", () => {
      assertXpath("//a[position()=last()]", "a:nth-last-of-type(1)");
      assertXpath("//a[position()=last()-98]", "a:nth-last-of-type(99)");
      assertXpath(
        "//a[contains(concat(' ',normalize-space(@class),' '),' b ')][position()=last()-98]",
        "a.b:nth-last-of-type(99)",
      );
    });
    it(":nth and friends (extended-syntax)", () => {
      assertXpath("//a[position()=1]", "a:first()");
      assertXpath("//a[position()=1]", "a:first");
      assertXpath("//a[position()=99]", "a:eq(99)");
      assertXpath("//a[position()=99]", "a:nth(99)");
      assertXpath("//a[position()=last()]", "a:last()");
      assertXpath("//a[position()=last()]", "a:last");
      assertXpath("//a[node()]", "a:parent");
    });
    it(":nth-child and friends", () => {
      assertXpath("//a[count(preceding-sibling::*)=0]", "a:first-child");
      assertXpath("//a[count(preceding-sibling::*)=98]", "a:nth-child(99)");
      assertXpath("//a[count(following-sibling::*)=0]", "a:last-child");
      assertXpath("//a[count(following-sibling::*)=0]", "a:nth-last-child(1)");
      assertXpath("//a[count(following-sibling::*)=98]", "a:nth-last-child(99)");
    });
    it("[n] as :nth-child (extended-syntax)", () => {
      assertXpath("//a[count(preceding-sibling::*)=1]", "a[2]");
    });
    it(":has()", () => {
      assertXpath("//a[.//b]", "a:has(b)");
      assertXpath("//a[.//b/c]", "a:has(b > c)");
      assertXpath("//a[./b]", "a:has(> b)");
      assertXpath("//a[./following-sibling::b]", "a:has(~ b)");
      assertXpath("//a[./following-sibling::*[1]/self::b]", "a:has(+ b)");
    });
    it(":only-child", () => {
      assertXpath(
        "//a[count(preceding-sibling::*)=0 and count(following-sibling::*)=0]",
        "a:only-child",
      );
    });
    it(":only-of-type", () => {
      assertXpath("//a[last()=1]", "a:only-of-type");
    });
    it(":empty", () => {
      assertXpath("//a[not(node())]", "a:empty");
    });
    it(":nth(an+b)", () => {
      assertXpath("//a[(position() mod 2)=0]", "a:nth-of-type(2n)");
      assertXpath("//a[(position()>=1) and (((position()-1) mod 2)=0)]", "a:nth-of-type(2n+1)");
      assertXpath("//a[(position()>=1) and (((position()-1) mod 2)=0)]", "a:nth-of-type(2n + 1)");
      assertXpath("//a[(position() mod 2)=0]", "a:nth-of-type(even)");
      assertXpath("//a[(position()>=1) and (((position()-1) mod 2)=0)]", "a:nth-of-type(odd)");
      assertXpath("//a[(position()>=3) and (((position()-3) mod 4)=0)]", "a:nth-of-type(4n+3)");
      assertXpath("//a[position()<=3]", "a:nth-of-type(-1n+3)");
      assertXpath("//a[position()<=3]", "a:nth-of-type(-1n +  3)");
      assertXpath("//a[position()<=3]", "a:nth-of-type(-n+3)");
      assertXpath("//a[position()>=3]", "a:nth-of-type(1n+3)");
      assertXpath("//a[position()>=3]", "a:nth-of-type(n+3)");
      assertXpath("//a[((last()-position()+1) mod 2)=0]", "a:nth-last-of-type(2n)");
      assertXpath(
        "//a[((last()-position()+1)>=1) and ((((last()-position()+1)-1) mod 2)=0)]",
        "a:nth-last-of-type(2n+1)",
      );
      assertXpath("//a[((last()-position()+1) mod 2)=0]", "a:nth-last-of-type(even)");
      assertXpath(
        "//a[((last()-position()+1)>=1) and ((((last()-position()+1)-1) mod 2)=0)]",
        "a:nth-last-of-type(odd)",
      );
      assertXpath(
        "//a[((last()-position()+1)>=3) and ((((last()-position()+1)-3) mod 4)=0)]",
        "a:nth-last-of-type(4n+3)",
      );
      assertXpath("//a[(last()-position()+1)<=3]", "a:nth-last-of-type(-1n+3)");
      assertXpath("//a[(last()-position()+1)<=3]", "a:nth-last-of-type(-n+3)");
      assertXpath("//a[(last()-position()+1)>=3]", "a:nth-last-of-type(1n+3)");
      assertXpath("//a[(last()-position()+1)>=3]", "a:nth-last-of-type(n+3)");
    });
    it(":not()", () => {
      assertXpath("//ol/*[not(self::li)]", "ol > *:not(li)");
      assertXpath(
        "//*[@id='p' and not(contains(concat(' ',normalize-space(@class),' '),' a '))]",
        "#p:not(.a)",
      );
      assertXpath(
        "//p[contains(concat(' ',normalize-space(@class),' '),' a ') and not(contains(concat(' ',normalize-space(@class),' '),' b '))]",
        "p.a:not(.b)",
      );
      assertXpath(
        "//p[@a='foo' and not(contains(concat(' ',normalize-space(@class),' '),' b '))]",
        "p[a='foo']:not(.b)",
      );
    });
    it("chained :not()", () => {
      assertXpath(
        "//p[not(contains(concat(' ',normalize-space(@class),' '),' a ')) and not(contains(concat(' ',normalize-space(@class),' '),' b ')) and not(contains(concat(' ',normalize-space(@class),' '),' c '))]",
        "p:not(.a):not(.b):not(.c)",
      );
    });
    it("combinations of :not() and nth-and-friends", () => {
      assertXpath("//ol/*[not(count(following-sibling::*)=0)]", "ol > *:not(:last-child)");
      assertXpath(
        "//ol/*[not(count(preceding-sibling::*)=0 and count(following-sibling::*)=0)]",
        "ol > *:not(:only-child)",
      );
    });
    it("miscellaneous pseudo-classes are converted into xpath function calls", () => {
      assertXpath("//a[nokogiri:aaron(.)]", "a:aaron");
      assertXpath("//a[nokogiri:aaron(.)]", "a:aaron()");
      assertXpath("//a[nokogiri:aaron(.,12)]", "a:aaron(12)");
      assertXpath("//a[nokogiri:aaron(.,12,1)]", "a:aaron(12, 1)");
      assertXpath("//a[nokogiri:link(.)]", "a:link");
      assertXpath("//a[nokogiri:visited(.)]", "a:visited");
      assertXpath("//a[nokogiri:hover(.)]", "a:hover");
      assertXpath("//a[nokogiri:active(.)]", "a:active");
      assertXpath("//a[nokogiri:foo(.,@href)]", "a:foo(@href)");
      assertXpath("//a[nokogiri:foo(.,@href,@id)]", "a:foo(@href, @id)");
      assertXpath("//a[nokogiri:foo(.,@a,b)]", "a:foo(@a, b)");
      assertXpath("//a[nokogiri:foo(.,a,@b)]", "a:foo(a, @b)");
      assertXpath("//a[nokogiri:foo(.,a,10)]", "a:foo(a, 10)");
      assertXpath("//a[nokogiri:foo(.,42)]", "a:foo(42)");
      assertXpath("//a[nokogiri:foo(.,'bar')]", "a:foo('bar')");
    });
    it("bare pseudo-class matches any ident", () => {
      assertXpath("//*[nokogiri:link(.)]", ":link");
      assertXpath("//*[not(@id='foo')]", ":not(#foo)");
      assertXpath("//*[count(preceding-sibling::*)=0]", ":first-child");
    });
  });
  describe("combinators", () => {
    it("descendant", () => {
      assertXpath("//x//y", "x y");
    });
    it("~ general sibling", () => {
      assertXpath("//E/following-sibling::F", "E ~ F");
      assertXpath("//E/following-sibling::F//G", "E ~ F G");
    });
    it("~ general sibling prefixless is relative to context node", () => {
      assertXpath("./following-sibling::a", "~a");
      assertXpath("./following-sibling::a", "~ a");
      assertXpath("./following-sibling::a//b/following-sibling::i", "~a b~i");
      assertXpath("./following-sibling::a//b/following-sibling::i", "~ a b ~ i");
    });
    it("+ adjacent sibling", () => {
      assertXpath("//E/following-sibling::*[1]/self::F", "E + F");
      assertXpath("//E/following-sibling::*[1]/self::F//G", "E + F G");
    });
    it("+ adjacent sibling prefixless is relative to context node", () => {
      assertXpath("./following-sibling::*[1]/self::a", "+a");
      assertXpath("./following-sibling::*[1]/self::a", "+ a");
      assertXpath("./following-sibling::*[1]/self::a/following-sibling::*[1]/self::b", "+a+b");
      assertXpath("./following-sibling::*[1]/self::a/following-sibling::*[1]/self::b", "+ a + b");
    });
    it("> child", () => {
      assertXpath("//x/y", "x > y");
      assertXpath("//a//b/i", "a b>i");
      assertXpath("//a//b/i", "a b > i");
      assertXpath("//a/b/i", "a > b > i");
    });
    it("> child prefixless is relative to context node", () => {
      assertXpath("./a", ">a");
      assertXpath("./a", "> a");
      assertXpath("./a//b/i", ">a b>i");
      assertXpath("./a/b/i", "> a > b > i");
    });
    it("/ (extended-syntax)", () => {
      assertXpath("//x/y", "x/y");
      assertXpath("//x/y", "x / y");
    });
    it("// (extended-syntax)", () => {
      assertXpath("//x//y", "x//y");
      assertXpath("//x//y", "x // y");
    });
  });
  describe("functions", () => {
    it("handles text() (extended-syntax)", () => {
      assertXpath("//a[child::text()]", "a[text()]");
      assertXpath("//child::text()", "text()");
      assertXpath("//a//child::text()", "a text()");
      assertXpath("//a/child::text()", "a / text()");
      assertXpath("//a/child::text()", "a > text()");
      assertXpath("//a//child::text()", "a text()");
    });
    it("handles comment() (extended-syntax)", () => {
      assertXpath("//script//comment()", "script comment()");
    });
    it("handles contains() (extended-syntax)", () => {
      assertXpath('//div[contains(.,"youtube")]', 'div:contains("youtube")');
    });
    it("handles gt() (extended-syntax)", () => {
      assertXpath("//td[position()>3]", "td:gt(3)");
    });
    it("handles self()", () => {
      assertXpath("//self::div", "self(div)");
    });
  });
  it("handles pseudo-class with class selector", () => {
    assertXpath(
      "//a[nokogiri:active(.) and contains(concat(' ',normalize-space(@class),' '),' foo ')]",
      "a:active.foo",
    );
    assertXpath(
      "//a[contains(concat(' ',normalize-space(@class),' '),' foo ') and nokogiri:active(.)]",
      "a.foo:active",
    );
  });
  it("handles pseudo-class with an id selector", () => {
    assertXpath("//a[@id='foo' and nokogiri:active(.)]", "a#foo:active");
    assertXpath("//a[nokogiri:active(.) and @id='foo']", "a:active#foo");
  });
  it("handles function with pseudo-class", () => {
    assertXpath("//child::text()[position()=99]", "text():nth-of-type(99)");
  });
  it("handles multiple selectors", () => {
    assertXpath(["//x/y", "//y/z"], "x > y, y > z");
    assertXpath(["//x/y", "//y/z"], "x > y,y > z");
  });
  describe("builtins:always", () => {
    it(". class", () => {
      assertXpath("//*[nokogiri-builtin:css-class(@class,'awesome')]", ".awesome", {
        builtins: "always",
      });
      assertXpath("//foo[nokogiri-builtin:css-class(@class,'awesome')]", "foo.awesome", {
        builtins: "always",
      });
      assertXpath("//foo//*[nokogiri-builtin:css-class(@class,'awesome')]", "foo .awesome", {
        builtins: "always",
      });
      assertXpath("//foo//*[nokogiri-builtin:css-class(@class,'awe.some')]", "foo .awe\\.some", {
        builtins: "always",
      });
      assertXpath(
        "//*[nokogiri-builtin:css-class(@class,'a') and nokogiri-builtin:css-class(@class,'b')]",
        ".a.b",
        { builtins: "always" },
      );
    });
    it("~=", () => {
      assertXpath("//a[nokogiri-builtin:css-class(@class,'bar')]", "a[class~='bar']", {
        builtins: "always",
      });
      assertXpath("//a[nokogiri-builtin:css-class(@class,'bar')]", "a[class ~= 'bar']", {
        builtins: "always",
      });
      assertXpath("//a[nokogiri-builtin:css-class(@class,'bar')]", "a[class~=bar]", {
        builtins: "always",
      });
      assertXpath("//a[nokogiri-builtin:css-class(@class,'bar')]", 'a[class~="bar"]', {
        builtins: "always",
      });
      assertXpath("//a[nokogiri-builtin:css-class(@data-words,'bar')]", 'a[data-words~="bar"]', {
        builtins: "always",
      });
    });
    it("~= (extended-syntax)", () => {
      assertXpath("//a[nokogiri-builtin:css-class(@class,'bar')]", "a[@class~='bar']", {
        builtins: "always",
      });
      assertXpath("//a[nokogiri-builtin:css-class(@class,'bar')]", "a[@class ~= 'bar']", {
        builtins: "always",
      });
      assertXpath("//a[nokogiri-builtin:css-class(@class,'bar')]", "a[@class~=bar]", {
        builtins: "always",
      });
      assertXpath("//a[nokogiri-builtin:css-class(@class,'bar')]", 'a[@class~="bar"]', {
        builtins: "always",
      });
      assertXpath("//a[nokogiri-builtin:css-class(@data-words,'bar')]", 'a[@data-words~="bar"]', {
        builtins: "always",
      });
    });
  });
  describe("doctype:html5", () => {
    describe("builtins:always", () => {
      it("avoids the wildcard when using namespaces", () => {
        assertXpath("//ns1:foo", "ns1|foo", { doctype: "html5", builtins: "always" });
      });
    });
    describe("builtins:never", () => {
      it("matches on the element's local-name, ignoring namespaces", () => {
        assertXpath("//*[local-name()='foo']", "foo", { doctype: "html5", builtins: "never" });
      });
      it("avoids the wildcard when using attribute selectors (extended-syntax)", () => {
        assertXpath("//*[local-name()='a']/@href", "a/@href", {
          doctype: "html5",
          builtins: "never",
        });
      });
    });
  });
});
