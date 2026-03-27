import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "./index.js";
import { I18n } from "@blazetrails/activemodel";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

describe("ActiveRecordI18nTests", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    I18n.reset();
    adapter = createTestAdapter();
  });

  it("translated model attributes", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    I18n.storeTranslations("en", {
      activerecord: { attributes: { topic: { title: "topic title attribute" } } },
    });

    expect(Topic.humanAttributeName("title")).toBe("topic title attribute");
  });

  it("translated model attributes with symbols", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    I18n.storeTranslations("en", {
      activerecord: { attributes: { topic: { title: "topic title attribute" } } },
    });

    expect(Topic.humanAttributeName("title")).toBe("topic title attribute");
  });

  it("translated model attributes with sti", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class Reply extends Topic {}

    I18n.storeTranslations("en", {
      activerecord: { attributes: { reply: { title: "reply title attribute" } } },
    });

    expect(Reply.humanAttributeName("title")).toBe("reply title attribute");
  });

  it("translated model attributes with sti fallback", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class Reply extends Topic {}

    I18n.storeTranslations("en", {
      activerecord: { attributes: { topic: { title: "topic title attribute" } } },
    });

    expect(Reply.humanAttributeName("title")).toBe("topic title attribute");
  });

  it("translated model names", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    I18n.storeTranslations("en", {
      activerecord: { models: { topic: "topic model" } },
    });

    expect(Topic.modelName.human).toBe("topic model");
  });

  it("translated model names with sti", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class Reply extends Topic {}

    I18n.storeTranslations("en", {
      activerecord: { models: { reply: "reply model" } },
    });

    expect(Reply.modelName.human).toBe("reply model");
  });

  it("translated model names with sti fallback", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class Reply extends Topic {}

    I18n.storeTranslations("en", {
      activerecord: { models: { topic: "topic model" } },
    });

    expect(Reply.modelName.human).toBe("topic model");
  });
});
