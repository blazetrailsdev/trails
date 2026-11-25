import { beforeEach, describe, expect, it } from "vitest";
import "../support/abstract-unit.js";
import { Conversion, Naming } from "@blazetrails/activemodel";
import { isBlank } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { Struct, extend, include } from "@blazetrails/ruby-compat";
import { ActionController, type RouteSet } from "@blazetrails/actionpack";
import { TestCase } from "@blazetrails/actionpack/testing";

class Scroll extends Struct.new("id", "toParam", "title", "body", "updatedAt", "createdAt") {
  static {
    extend(this, Naming);
    include(this, Conversion);
  }

  isPersisted(): boolean {
    return false;
  }
}

const entryBody = `
      entry.title(scroll.title);
      entry.content(scroll.body, { type: "html" });

      entry.author((author) => {
        author.name("DHH");
      });`;

function feed(args: string, entryArgs: string, body: string = entryBody, head = ""): string {
  return `atomFeed(${args}, (feed) => {
  feed.title("My great blog!");
  feed.updated(scrolls[0].createdAt);
${head}
  for (const scroll of scrolls) {
    feed.entry(${entryArgs}, (entry) => {${body}
    });
  }
});`;
}

const FEEDS: Record<string, string> = {};
FEEDS["defaults"] = feed(`{ schemaDate: "2008", xml }`, "scroll");
FEEDS["entry_options"] = feed(
  "{ xml }",
  `scroll, { url: "/otherstuff/" + String(scroll.toParam), updated: TopLevel.Time.utc(2007, 1, scroll.id) }`,
);
FEEDS["entry_type_options"] = feed(`{ schemaDate: "2008", xml }`, `scroll, { type: "text/xml" }`);
FEEDS["entry_url_false_option"] = feed("{ xml }", "scroll, { url: false }");
FEEDS["xml_block"] = feed(
  "{ xml }",
  `scroll, { url: "/otherstuff/" + String(scroll.toParam), updated: TopLevel.Time.utc(2007, 1, scroll.id) }`,
  `
      entry.title(scroll.title);
      entry.content(scroll.body, { type: "html" });`,
  `
  feed.author((author) => {
    author.name("DHH");
  });`,
);
const appEdited = `
      entry.tagBang("app:edited", TopLevel.Time.now());`;
FEEDS["feed_with_atomPub_namespace"] = feed(
  `{ "xmlns:app": "http://www.w3.org/2007/app", "xmlns:openSearch": "http://a9.com/-/spec/opensearch/1.1/", xml }`,
  "scroll",
  entryBody.replace(`{ type: "html" });`, `{ type: "html" });${appEdited}`),
);
FEEDS["feed_with_overridden_ids"] = feed(
  `{ id: "tag:test.rubyonrails.org,2008:test/", xml }`,
  `scroll, { id: "tag:test.rubyonrails.org,2008:" + String(scroll.id) }`,
  entryBody.replace(`{ type: "html" });`, `{ type: "html" });${appEdited}`),
);
FEEDS["feed_with_xml_processing_instructions"] = feed(
  `{ schemaDate: "2008", instruct: { "xml-stylesheet": { href: "t.css", type: "text/css" } }, xml }`,
  "scroll",
);
FEEDS["feed_with_xml_processing_instructions_duplicate_targets"] = feed(
  `{ schemaDate: "2008", instruct: { target1: [{ a: "1", b: "2" }, { c: "3", d: "4" }] }, xml }`,
  "scroll",
);
FEEDS["feed_with_xhtml_content"] = feed(
  "{ xml }",
  "scroll",
  `
      entry.title(scroll.title);
      entry.summary({ type: "xhtml" }, (xhtml) => {
        xhtml.p(\`before \${scroll.id}\`);
        xhtml.p(() => xhtml.append(scroll.body));
        xhtml.p(\`after \${scroll.id}\`);
      });${appEdited}

      entry.author((author) => {
        author.name("DHH");
      });`,
);
FEEDS["provide_builder"] = `
const newXml = new TopLevel.Builder.XmlMarkup({ target: "" });
${feed("{ xml: newXml }", "scroll")}`;

class ScrollsController extends ActionController.Base {
  declare scrolls: Scroll[];

  static readonly FEEDS = FEEDS;

  async index(): Promise<void> {
    this.scrolls = [
      new Scroll(
        1,
        "1",
        "Hello One",
        "Something <i>COOL!</i>",
        Time.utc(2007, 12, 12, 15),
        Time.utc(2007, 12, 12, 15),
      ),
      new Scroll(2, "2", "Hello Two", "Something Boring", Time.utc(2007, 12, 12, 15)),
    ];

    await this.render({ inline: FEEDS[this.params.get("id") as string], type: ":builder" });
  }
}

class AtomFeedTest extends TestCase {
  static {
    this.tests(ScrollsController);
  }

  override setup(): void {
    super.setup();
    this.request.host = "www.nextangle.com";
  }

  async withRestfulRouting(resources: string, block: () => Promise<void>): Promise<void> {
    await this.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources(resources);
      });
      await block();
    });
  }
}

describe("AtomFeedTest", () => {
  let tc: AtomFeedTest & {
    assertSelect(selector: string, equality?: unknown): void;
  };

  beforeEach(async ({ task }) => {
    tc = new AtomFeedTest(task.name) as typeof tc;
    await tc.beforeSetup();
    tc.setup();
  });

  it("feed should use default language if none is given", async () => {
    await tc.withRestfulRouting("scrolls", async () => {
      await tc.get("index", { params: { id: "defaults" } });
      expect(tc.response.body).toMatch(/xml:lang="en-US"/);
    });
  });

  it("feed should include two entries", async () => {
    await tc.withRestfulRouting("scrolls", async () => {
      await tc.get("index", { params: { id: "defaults" } });
      tc.assertSelect("entry", 2);
    });
  });

  it("entry should only use published if created at is present", async () => {
    await tc.withRestfulRouting("scrolls", async () => {
      await tc.get("index", { params: { id: "defaults" } });
      tc.assertSelect("published", 1);
    });
  });

  it("providing builder to atom feed", async () => {
    await tc.withRestfulRouting("scrolls", async () => {
      await tc.get("index", { params: { id: "provide_builder" } });
      expect(isBlank(tc.response.body)).toBeTruthy();
    });
  });

  it("entry with prefilled options should use those instead of querying the record", async () => {
    await tc.withRestfulRouting("scrolls", async () => {
      await tc.get("index", { params: { id: "entry_options" } });

      tc.assertSelect("updated", Time.utc(2007, 1, 1).xmlschema());
      tc.assertSelect("updated", Time.utc(2007, 1, 2).xmlschema());
    });
  });

  it("self url should default to current request url", async () => {
    await tc.withRestfulRouting("scrolls", async () => {
      await tc.get("index", { params: { id: "defaults" } });
      tc.assertSelect('link[rel=self][href="http://www.nextangle.com/scrolls?id=defaults"]');
    });
  });

  it("feed id should be a valid tag", async () => {
    await tc.withRestfulRouting("scrolls", async () => {
      await tc.get("index", { params: { id: "defaults" } });
      tc.assertSelect("id", { text: "tag:www.nextangle.com,2008:/scrolls?id=defaults" });
    });
  });

  it("entry id should be a valid tag", async () => {
    await tc.withRestfulRouting("scrolls", async () => {
      await tc.get("index", { params: { id: "defaults" } });
      tc.assertSelect("entry id", { text: "tag:www.nextangle.com,2008:Scroll/1" });
      tc.assertSelect("entry id", { text: "tag:www.nextangle.com,2008:Scroll/2" });
    });
  });

  it("feed should allow nested xml blocks", async () => {
    await tc.withRestfulRouting("scrolls", async () => {
      await tc.get("index", { params: { id: "xml_block" } });
      tc.assertSelect("author name", { text: "DHH" });
    });
  });

  it("feed should include atomPub namespace", async () => {
    await tc.withRestfulRouting("scrolls", async () => {
      await tc.get("index", { params: { id: "feed_with_atomPub_namespace" } });
      expect(tc.response.body).toMatch(/xml:lang="en-US"/);
      expect(tc.response.body).toMatch(/xmlns="http:\/\/www\.w3\.org\/2005\/Atom"/);
      expect(tc.response.body).toMatch(/xmlns:app="http:\/\/www\.w3\.org\/2007\/app"/);
    });
  });

  it("feed should allow overriding ids", async () => {
    await tc.withRestfulRouting("scrolls", async () => {
      await tc.get("index", { params: { id: "feed_with_overridden_ids" } });
      tc.assertSelect("id", { text: "tag:test.rubyonrails.org,2008:test/" });
      tc.assertSelect("entry id", { text: "tag:test.rubyonrails.org,2008:1" });
      tc.assertSelect("entry id", { text: "tag:test.rubyonrails.org,2008:2" });
    });
  });

  it("feed xml processing instructions", async () => {
    await tc.withRestfulRouting("scrolls", async () => {
      await tc.get("index", { params: { id: "feed_with_xml_processing_instructions" } });
      expect(tc.response.body).toMatch(/<\?xml-stylesheet [^?]*type="text\/css"/);
      expect(tc.response.body).toMatch(/<\?xml-stylesheet [^?]*href="t\.css"/);
    });
  });

  it("feed xml processing instructions duplicate targets", async () => {
    await tc.withRestfulRouting("scrolls", async () => {
      await tc.get("index", {
        params: { id: "feed_with_xml_processing_instructions_duplicate_targets" },
      });
      expect(tc.response.body).toMatch(/<\?target1 (a="1" b="2"|b="2" a="1")\?>/);
      expect(tc.response.body).toMatch(/<\?target1 (c="3" d="4"|d="4" c="3")\?>/);
    });
  });

  it("feed xhtml", async () => {
    await tc.withRestfulRouting("scrolls", async () => {
      await tc.get("index", { params: { id: "feed_with_xhtml_content" } });
      expect(tc.response.body).toMatch(/xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/);
      tc.assertSelect("summary", { text: /Something Boring/ });
      tc.assertSelect("summary", { text: /after 2/ });
    });
  });

  it("feed entry type option default to text html", async () => {
    await tc.withRestfulRouting("scrolls", async () => {
      await tc.get("index", { params: { id: "defaults" } });
      tc.assertSelect('entry link[rel=alternate][type="text/html"]');
    });
  });

  it("feed entry type option specified", async () => {
    await tc.withRestfulRouting("scrolls", async () => {
      await tc.get("index", { params: { id: "entry_type_options" } });
      tc.assertSelect('entry link[rel=alternate][type="text/xml"]');
    });
  });

  it("feed entry url false option adds no link", async () => {
    await tc.withRestfulRouting("scrolls", async () => {
      await tc.get("index", { params: { id: "entry_url_false_option" } });
      tc.assertSelect("entry link", false);
    });
  });
});
