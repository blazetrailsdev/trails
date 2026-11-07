import { beforeEach, describe, it } from "vitest";
import {
  assertEqual,
  assertRaise,
  Logger,
  ToJsonWithActiveSupportEncoder,
} from "@blazetrails/activesupport";
import { MissingTemplate } from "@blazetrails/actionview";
import "../../test-helpers/abstract-unit.js";
import { Mime } from "../../action-dispatch/http/mime-type.js";
import { Base } from "../base.js";
import { addRenderer, removeRenderer, Renderers } from "../metal/renderers.js";
import { TestCase } from "../test-case.js";

describe("RenderersTest", () => {
  class XmlRenderable {
    toXml(options: Record<string, unknown>): string {
      options.root ||= "i-am-xml";
      return `<${options.root}/>`;
    }
  }
  class JsonRenderable {
    asJson(options: { except?: string[] } | null = {}): Record<string, string> {
      const hash: Record<string, string> = { a: "b", c: "d", e: "f" };
      if (options?.except) for (const key of options.except) delete hash[key];
      return hash;
    }

    toJSON(_options: Record<string, unknown> = {}): unknown {
      return ToJsonWithActiveSupportEncoder.toJSON.call(this, { except: ["c", "e"] });
    }
  }
  class CsvRenderable {
    toCsv(): string {
      return "c,s,v";
    }
  }
  class TestController extends Base {
    declare logger: Logger;

    async renderSimonSays() {
      await this.render({ simon: "foo" } as Record<string, unknown>);
    }

    async respondToMime() {
      await this.respondTo((type) => {
        type.json(() => this.render({ json: new JsonRenderable() }));
        type.js(() => this.render({ json: "JS", callback: "alert" }));
        type.csv(() => this.render({ csv: new CsvRenderable() } as Record<string, unknown>));
        type.xml(() => this.render({ xml: new XmlRenderable() }));
        type.html(() => this.render({ body: "HTML" }));
        type.rss(() => this.render({ body: "RSS" }));
        type.all(() => this.render({ body: "Nothing" }));
        type.any("js", "xml", () => this.render({ body: "Either JS or XML" }));
      });
    }
  }

  class RenderersTest extends TestCase {
    declare controller: TestController;

    static {
      this.tests(TestController);
    }

    override setup() {
      super.setup();
      this.controller.logger = new Logger(null);
    }
  }

  let tc: RenderersTest;

  beforeEach(async ({ task }) => {
    tc = new RenderersTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("using custom render option", async () => {
    try {
      addRenderer("simon", function (this: TestController, says) {
        this.contentType = Mime.get("text");
        return (this.responseBody = `Simon says: ${says}`);
      });

      await tc.get("renderSimonSays");
      assertEqual("Simon says: foo", tc.response.body);
    } finally {
      removeRenderer("simon");
    }
  });

  it("raises missing template no renderer", async () => {
    await assertRaise([MissingTemplate], {}, async () => {
      await tc.get("respondToMime", { format: "csv" });
    });
    assertEqual(Mime.get("csv"), tc.response.mediaType);
    assertEqual("", tc.response.body);
  });

  it("adding csv rendering via renderers add", async () => {
    try {
      Renderers.add("csv", function (this: TestController, value) {
        return this.sendData((value as CsvRenderable).toCsv(), { type: Mime.get("csv") });
      });
      tc.request.accept = "text/csv";
      await tc.get("respondToMime", { format: "csv" });
      assertEqual(Mime.get("csv"), tc.response.mediaType);
      assertEqual("c,s,v", tc.response.body);
    } finally {
      Renderers.remove("csv");
    }
  });
});
