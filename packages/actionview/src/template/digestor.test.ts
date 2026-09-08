import { beforeEach, describe, expect, it } from "vitest";

import { Digestor } from "../digestor.js";
import { DetailsKey, LookupContext } from "../lookup-context.js";
import { FixtureResolver } from "../testing/resolvers.js";

const FIXTURES: Record<string, string> = {
  "comments/_comment.html.tse": "Great story!",
  "comments/_comment.json.tse": '{"content": "Great story!"}',
  "comments/_comments.html.tse": `<%= render partial: "comments/comment", collection: commentable.comments %>`,
  "comments/_cycle_a.html.tse": `<% if some_condition %>\n  <%= render partial: "cycle_b" %>\n<% end %>`,
  "comments/_cycle_b.html.tse": `<% if some_other_condition %>\n  <%= render partial: "cycle_a" %>\n<% end %>`,
  "comments/cycle.html.tse": `<%= render partial: "cycle_a" %>`,
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
<%= render              @message %>
<%= render ( @message.events ) %>
<%= render    :partial =>    "comments/comment", :collection => @message.comments %>
`,
  "messages/_form.html.tse": "",
  "messages/_header.html.tse": "",
  "messages/index.html.tse": "<%= render @messages %>\n<%= render @events %>\n",
  "messages/_message.html.tse": "THIS BE WHERE THEM MESSAGE GO, YO!",
  "messages/peek.html.tse": `<%# Template Dependency: messages/message %>
<%= render "comments/comments" %>
`,
  "messages/show.html.tse": `<%# Template Dependency: messages/message %>
<%= render "header" %>
<%= render "comments/comments" %>

<%= render "messages/actions/move" %>

<%= render @message.history.events %>

<%= render "something_missing"   %>
<%= render "something_missing_1" %>

<%
  # Template Dependency: messages/form
%>
`,
};

interface DigestOptions {
  dependencies?: string[];
  format?: string;
}

describe("TemplateDigestorTest", () => {
  let templates: Record<string, string>;
  let resolver: FixtureResolver;
  let _finder: LookupContext;

  beforeEach(() => {
    DetailsKey.clear();
    templates = { ...FIXTURES };
    resolver = new FixtureResolver(templates);
    _finder = new LookupContext();
    _finder.addResolver(resolver);
  });

  function finder(): LookupContext {
    return _finder;
  }

  function digest(templateName: string, options: DigestOptions = {}): string {
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

  function nestedDependencies(templateName: string): unknown[] {
    const tree = Digestor.tree(templateName, finder());
    return tree.children.map((node) => node.toDepMap());
  }

  function changeTemplate(templateName: string): void {
    templates[`${templateName}.html.tse`] = "\nTHIS WAS CHANGED!";
  }

  function removeTemplate(templateName: string): void {
    delete templates[`${templateName}.html.tse`];
  }

  function assertDigestDifference(templateName: string, block: () => void): void {
    const previousDigest = digest(templateName);
    resolver.clearCache();
    finder().digestCache().clear();

    block();

    expect(digest(templateName), "digest didn't change").not.toBe(previousDigest);
    finder().digestCache().clear();
    resolver.clearCache();
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
    assertDigestDifference("events/index", () => {
      changeTemplate("events/_uncompleted");
    });
  });

  it("explicit dependency wildcard picks up removed file", () => {
    changeTemplate("events/_subscribers_changed");

    assertDigestDifference("events/index", () => {
      removeTemplate("events/_subscribers_changed");
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
    const htmlDigest = digest("comments/_comment", { format: "html" });
    const jsonDigest = digest("comments/_comment", { format: "json" });

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
});
