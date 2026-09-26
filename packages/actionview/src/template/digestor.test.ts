import { beforeEach, describe, expect, it } from "vitest";
import { Logger, StringIO } from "@blazetrails/activesupport";

import { Base } from "../base.js";
import { Digestor, type Node } from "../digestor.js";
import { DetailsKey, LookupContext } from "../lookup-context.js";
import { FixtureResolver } from "../testing/resolvers.js";
import { Resolver } from "./resolver.js";

const FIXTURES: Record<string, string> = {
  "comments/_comment.html.tse": "Great story!",
  "comments/_comments.html.tse": `<%= render partial: "comments/comment", collection: commentable.comments %>`,
  "comments/_cycle_a.html.tse": `<% if some_condition %>\n  <%= render partial: "cycle_b" %>\n<% end %>`,
  "comments/_cycle_b.html.tse": `<% if some_other_condition %>\n  <%= render partial: "cycle_a" %>\n<% end %>`,
  "comments/cycle.html.tse": `<%= render partial: "cycle_a" %>`,
  "comments/show.js.tse": `alert("<%=j render("comments/comment") %>")\n`,
  "events/_completed.html.tse": "",
  "events/_event.html.tse": "",
  "events/index.html.tse": "<% # Template Dependency: events/* %>",
  "level/below/_header.html.tse": "",
  "level/below/index.html.tse": `<%= render partial: "header" %>`,
  "level/_recursion.html.tse": "<%= render 'recursion' %>",
  "level/recursion.html.tse": "<%= render 'recursion' %>",
  "messages/actions/_move.html.tse": "",
  "messages/edit.html.tse": `<%= render              "header" %>
<%= render    partial:  "form" %>
<%= render              this.message %>
<%= render ( this.message.events ) %>
<%= render    partial:    "comments/comment", collection: this.message.comments %>
`,
  "messages/_form.html.tse": "",
  "messages/_header.html.tse": "",
  "messages/index.html.tse": "<%= render this.messages %>\n<%= render this.events %>\n",
  "messages/_message.html.tse": "THIS BE WHERE THEM MESSAGE GO, YO!",
  "messages/new.html+iphone.tse": `<%# Template Dependency: messages/message %>

<%= render "header" %>
<%= render "comments/comments" %>

<%= render "messages/actions/move" %>

<%= render this.message.history.events %>

<%# render "something_missing"   %>
<%# render "something_missing_1" %>

<%
  # Template Dependency: messages/form
%>`,
  "messages/peek.html.tse": `<%# Template Dependency: messages/message %>
<%= render "comments/comments" %>
`,
  "messages/show.html.tse": `<%# Template Dependency: messages/message %>
<%= render "header" %>
<%= render "comments/comments" %>

<%= render "messages/actions/move" %>

<%= render this.message.history.events %>

<%= render "something_missing"   %>
<%= render "something_missing_1" %>

<%
  # Template Dependency: messages/form
%>
`,
  "messages/thread.json.tse": `<%= render "comments/comments" %>\n`,
};

const API_FIXTURES: Record<string, string> = {
  "comments/_comment.json.tse": '{"content": "Great story!"}\n',
  "comments/_comments.json.tse": `<%= render partial: "comments/comment", collection: commentable.comments %>\n`,
};

let templates: Record<string, string>;
let apiTemplates: Record<string, string>;

class FixtureFinder extends LookupContext {
  static build(details: ConstructorParameters<typeof LookupContext>[1] = {}): FixtureFinder {
    return new this(
      [new FixtureResolver(templates), new FixtureResolver(apiTemplates)],
      details,
      [],
    );
  }
}

interface DigestOptions {
  dependencies?: string[];
  format?: string;
  variants?: string[];
}

describe("TemplateDigestorTest", () => {
  let _finder: LookupContext | null;

  beforeEach(() => {
    DetailsKey.clear();
    templates = { ...FIXTURES };
    apiTemplates = { ...API_FIXTURES };
    _finder = null;
  });

  function flatten(node: Node): Node[] {
    return [node, ...node.children.flatMap((child) => flatten(child))];
  }

  function assertLogged(message: string, block: () => void): void {
    const oldLogger = Base.logger;
    const log = new StringIO();
    Base.logger = new Logger(log);

    try {
      block();

      log.rewind();
      expect(log.read()).toMatch(message);
    } finally {
      Base.logger = oldLogger;
    }
  }

  function assertDigestDifference(
    templateName: string,
    options: DigestOptions,
    block: () => void,
  ): void;
  function assertDigestDifference(templateName: string, block: () => void): void;
  function assertDigestDifference(
    templateName: string,
    optionsOrBlock: DigestOptions | (() => void),
    maybeBlock?: () => void,
  ): void {
    const options = typeof optionsOrBlock === "function" ? {} : optionsOrBlock;
    const block = typeof optionsOrBlock === "function" ? optionsOrBlock : maybeBlock!;
    const previousDigest = digest(templateName, options);
    for (const path of finder().viewPaths) path.clearCache?.();
    finder().digestCache().clear();

    block();

    expect(digest(templateName, options), "digest didn't change").not.toBe(previousDigest);
    finder().digestCache().clear();
    for (const path of finder().viewPaths) path.clearCache?.();
  }

  function digest(templateName: string, options: DigestOptions = {}): string {
    finder().variants = options.variants ?? [];

    const finderWithFormats = options.format
      ? finder().withPrependedFormats([options.format])
      : finder();

    return Digestor.digest({
      name: templateName,
      format: options.format ?? null,
      finder: finderWithFormats,
      dependencies: options.dependencies ?? [],
    });
  }

  function dependencies(templateName: string): string[] {
    const tree = Digestor.tree(templateName, finder());
    return tree.children.map((node) => node.name);
  }

  function nestedDependencies(templateName: string): unknown[] {
    const tree = Digestor.tree(templateName, finder());
    return tree.children.map((node) => node.toDepMap());
  }

  function treeTemplateFormats(templateName: string): (string | null)[] {
    const tree = Digestor.tree(templateName, finder());
    return flatten(tree)
      .map((node) => node.template?.format)
      .filter((format) => format != null);
  }

  function disableResolverCaching(block: () => void): void {
    const oldCaching = Resolver.caching;
    Resolver.caching = false;
    try {
      block();
    } finally {
      Resolver.caching = oldCaching;
    }
  }

  function finder(): LookupContext {
    return (_finder ??= FixtureFinder.build());
  }

  function changeTemplate(templateName: string, variant: string | null = null): void {
    const suffix = variant ? `+${variant}` : "";
    templates[`${templateName}.html${suffix}.tse`] = "\nTHIS WAS CHANGED!";
  }
  const addTemplate = changeTemplate;

  function removeTemplate(templateName: string): void {
    delete templates[`${templateName}.html.tse`];
  }

  it("top level change reflected", () => {
    assertDigestDifference("messages/show", () => {
      changeTemplate("messages/show");
    });
  });

  it("explicit dependency", () => {
    assertDigestDifference("messages/show", () => {
      changeTemplate("messages/_message");
    });
  });

  it("explicit dependency in multiline tse tag", () => {
    assertDigestDifference("messages/show", () => {
      changeTemplate("messages/_form");
    });
  });

  it("explicit dependency wildcard", () => {
    assertDigestDifference("events/index", () => {
      changeTemplate("events/_completed");
    });
  });

  it("explicit dependency wildcard picks up added file", () => {
    disableResolverCaching(() => {
      assertDigestDifference("events/index", () => {
        addTemplate("events/_uncompleted");
      });
    });
  });

  it("explicit dependency wildcard picks up removed file", () => {
    disableResolverCaching(() => {
      addTemplate("events/_subscribers_changed");

      assertDigestDifference("events/index", () => {
        removeTemplate("events/_subscribers_changed");
      });
    });
  });

  it("second level dependency", () => {
    assertDigestDifference("messages/show", () => {
      changeTemplate("comments/_comments");
    });
  });

  it("second level dependency within same directory", () => {
    assertDigestDifference("messages/show", () => {
      changeTemplate("messages/_header");
    });
  });

  it("third level dependency", () => {
    assertDigestDifference("messages/show", () => {
      changeTemplate("comments/_comment");
    });
  });

  it("directory depth dependency", () => {
    assertDigestDifference("level/below/index", () => {
      changeTemplate("level/below/_header");
    });
  });

  it("logging of missing template", () => {
    assertLogged("Couldn't find template for digesting: messages/something_missing", () => {
      digest("messages/show");
    });
  });

  it("logging of missing template ending with number", () => {
    assertLogged("Couldn't find template for digesting: messages/something_missing_1", () => {
      digest("messages/show");
    });
  });

  it("logging of missing template for dependencies", () => {
    assertLogged("Couldn't find template for digesting: messages/something_missing", () => {
      dependencies("messages/something_missing");
    });
  });

  it("logging of missing template for nested dependencies", () => {
    assertLogged("Couldn't find template for digesting: messages/something_missing", () => {
      nestedDependencies("messages/something_missing");
    });
  });

  it("getting of singly nested dependencies", () => {
    const singlyNestedDependencies = [
      "messages/header",
      "messages/form",
      "messages/message",
      "events/event",
      "comments/comment",
    ];
    expect(nestedDependencies("messages/edit")).toEqual(singlyNestedDependencies);
  });

  it("getting of doubly nested dependencies", () => {
    const doublyNested = [{ "comments/comments": ["comments/comment"] }, "messages/message"];
    expect(nestedDependencies("messages/peek")).toEqual(doublyNested);
  });

  it("nested template directory", () => {
    assertDigestDifference("messages/show", () => {
      changeTemplate("messages/actions/_move");
    });
  });

  it("nested template deps", () => {
    const nestedDeps = [
      "messages/header",
      { "comments/comments": ["comments/comment"] },
      "messages/actions/move",
      "events/event",
      "messages/something_missing",
      "messages/something_missing_1",
      "messages/message",
      "messages/form",
    ];
    expect(nestedDependencies("messages/show")).toEqual(nestedDeps);
  });

  it("nested template deps with non default rendered format", () => {
    const nestedDeps = [{ "comments/comments": ["comments/comment"] }];
    expect(nestedDependencies("messages/thread")).toEqual(nestedDeps);
  });

  it("template formats of nested deps with non default rendered format", () => {
    _finder = finder().withPrependedFormats([":json"]);
    expect([...new Set(treeTemplateFormats("messages/thread"))]).toEqual([":json"]);
  });

  it("template formats of dependencies with same logical name and different rendered format", () => {
    expect([...new Set(treeTemplateFormats("messages/show"))]).toEqual([":html"]);
  });

  it("template dependencies with fallback from js to html format", () => {
    expect(dependencies("comments/show")).toEqual(["comments/comment"]);
  });

  it("template digest with fallback from js to html format", () => {
    assertDigestDifference("comments/show", () => {
      changeTemplate("comments/_comment");
    });
  });

  it("recursion in renders", () => {
    expect(digest("level/recursion")).toBeTruthy();
    expect(digest("level/recursion")).not.toBeNull();
  });

  it("chaining the top template on recursion", () => {
    expect(digest("level/recursion")).toBeTruthy();

    assertDigestDifference("level/recursion", () => {
      changeTemplate("level/recursion");
    });

    expect(digest("level/recursion")).not.toBeNull();
  });

  it("chaining the partial template on recursion", () => {
    expect(digest("level/recursion")).toBeTruthy();

    assertDigestDifference("level/recursion", () => {
      changeTemplate("level/_recursion");
    });

    expect(digest("level/recursion")).not.toBeNull();
  });

  it("dont generate a digest for missing templates", () => {
    expect(digest("nothing/there")).toBe("");
  });

  it("collection dependency", () => {
    assertDigestDifference("messages/index", () => {
      changeTemplate("messages/_message");
    });

    assertDigestDifference("messages/index", () => {
      changeTemplate("events/_event");
    });
  });

  it("collection derived from record dependency", () => {
    assertDigestDifference("messages/show", () => {
      changeTemplate("events/_event");
    });
  });

  it("details are included in cache key", () => {
    _finder = FixtureFinder.build({ formats: [":html"] });
    const oldDigest = digest("events/_event");

    changeTemplate("events/_event");

    _finder = FixtureFinder.build();

    expect(digest("events/_event")).not.toBe(oldDigest);
  });

  it("extra whitespace in render partial", () => {
    assertDigestDifference("messages/edit", () => {
      changeTemplate("messages/_form");
    });
  });

  it("extra whitespace in render named partial", () => {
    assertDigestDifference("messages/edit", () => {
      changeTemplate("messages/_header");
    });
  });

  it("extra whitespace in render record", () => {
    assertDigestDifference("messages/edit", () => {
      changeTemplate("messages/_message");
    });
  });

  it("extra whitespace in render with parenthesis", () => {
    assertDigestDifference("messages/edit", () => {
      changeTemplate("events/_event");
    });
  });

  it("old style hash in render invocation", () => {
    assertDigestDifference("messages/edit", () => {
      changeTemplate("comments/_comment");
    });
  });

  it("variants", () => {
    assertDigestDifference("messages/new", { variants: ["iphone"] }, () => {
      changeTemplate("messages/new", "iphone");
      changeTemplate("messages/_header", "iphone");
    });
  });

  it("dependencies via options results in different digest", () => {
    const digestPlain = digest("comments/_comment");
    const digestFridge = digest("comments/_comment", { dependencies: ["fridge"] });
    const digestPhone = digest("comments/_comment", { dependencies: ["phone"] });
    const digestFridgePhone = digest("comments/_comment", { dependencies: ["fridge", "phone"] });

    expect(digestPlain).not.toBe(digestFridge);
    expect(digestPlain).not.toBe(digestPhone);
    expect(digestPlain).not.toBe(digestFridgePhone);
    expect(digestFridge).not.toBe(digestPhone);
    expect(digestFridge).not.toBe(digestFridgePhone);
    expect(digestPhone).not.toBe(digestFridgePhone);
  });

  it("different formats with same logical template names results in different digests", () => {
    const htmlDigest = digest("comments/_comment", { format: ":html" });
    const jsonDigest = digest("comments/_comment", { format: ":json" });

    expect(htmlDigest).not.toBe(jsonDigest);
  });

  it("digest cache cleanup with recursion", () => {
    const firstDigest = digest("level/_recursion");
    const secondDigest = digest("level/_recursion");

    expect(firstDigest).toBeTruthy();

    expect(secondDigest).toBe(firstDigest);
  });

  it("digest cache with cycle", () => {
    const expectedDeps = [
      {
        "comments/cycle_a": [
          {
            "comments/cycle_b": ["comments/cycle_a"],
          },
        ],
      },
    ];
    expect(nestedDependencies("comments/cycle")).toEqual(expectedDeps);
  });

  it("digest cache cleanup with recursion and template caching off", () => {
    disableResolverCaching(() => {
      const firstDigest = digest("level/_recursion");
      const secondDigest = digest("level/_recursion");

      expect(firstDigest).toBeTruthy();

      expect(secondDigest).toBe(firstDigest);
    });
  });
});
