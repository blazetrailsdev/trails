import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DependencyTracker } from "../dependency-tracker.js";
import { TSETracker } from "../dependency-tracker/tse-tracker.js";
import { PathSet } from "../path-set.js";
import type { Template } from "../template.js";
import { TemplateHandlers, type TemplateHandler } from "../template/handlers.js";
import { Tse } from "../template/handlers/tse.js";
import { FixtureResolver } from "../testing/resolvers.js";

const NeckbeardTracker = {
  call(name: string, _template: Template): string[] {
    return [`foo/${name}`];
  },
};

class FakeTemplate {
  readonly source: string;
  readonly handler: TemplateHandler | null;

  constructor(source: string, handler: TemplateHandler | null | "tse" = Neckbeard) {
    this.source = source;
    this.handler = handler === "tse" ? new Tse() : handler;
  }

  type(): string[] {
    return ["text/html"];
  }
}

const Neckbeard: TemplateHandler = { extensions: ["neckbeard"], call: (_t, source) => source };
const Bowtie: TemplateHandler = { extensions: ["bowtie"], call: (_t, source) => source };

function asTemplate(template: FakeTemplate): Template {
  return template as unknown as Template;
}

const DIGESTOR_FIXTURES: Record<string, string> = {
  "events/_completed.html.tse": "",
  "events/_event.html.tse": "",
  "events/index.html.tse": "",
  "comments/_comment.html.tse": "",
};

function digestorViewPaths(): PathSet {
  return new PathSet([new FixtureResolver(DIGESTOR_FIXTURES)]);
}

describe("DependencyTrackerTest", () => {
  beforeEach(() => {
    TemplateHandlers.registerTemplateHandler("neckbeard", Neckbeard);
    DependencyTracker.registerTracker("neckbeard", NeckbeardTracker);
  });

  afterEach(() => {
    TemplateHandlers.unregisterTemplateHandler("neckbeard");
    DependencyTracker.removeTracker(Neckbeard);
  });

  it("finds tracker by template handler", () => {
    const template = new FakeTemplate("boo/hoo");
    const dependencies = DependencyTracker.findDependencies("boo/hoo", asTemplate(template));
    expect(dependencies).toEqual(["foo/boo/hoo"]);
  });

  it("returns empty array if no tracker is found", () => {
    const template = new FakeTemplate("boo/hoo", Bowtie);
    const dependencies = DependencyTracker.findDependencies("boo/hoo", asTemplate(template));
    expect(dependencies).toEqual([]);
  });
});

describe("TSETrackerTest", () => {
  function makeTracker(name: string, template: FakeTemplate, viewPaths: PathSet | null = null) {
    return new TSETracker(name, asTemplate(template), viewPaths);
  }

  it("dependency of tse template with number in filename", () => {
    const template = new FakeTemplate("<%= render 'messages/message123' %>", "tse");
    const tracker = makeTracker("messages/_message123", template);

    expect(tracker.dependencies()).toEqual(["messages/message123"]);
  });

  it("dependency of template partial with layout", () => {
    const template = new FakeTemplate(
      "<%= render partial: 'messages/show', layout: 'messages/layout' %>",
      "tse",
    );
    const tracker = makeTracker("multiple/_dependencies", template);

    expect(tracker.dependencies().sort()).toEqual(["messages/layout", "messages/show"]);
  });

  it("dependency of template layout standalone", () => {
    const template = new FakeTemplate("<%= render layout: 'messages/layout' do %>", "tse");
    const tracker = makeTracker("messages/layout", template);

    expect(tracker.dependencies()).toEqual(["messages/layout"]);
  });

  it("finds dependency in correct directory", () => {
    const template = new FakeTemplate("<%= render(message.topic) %>", "tse");
    const tracker = makeTracker("messages/_message", template);

    expect(tracker.dependencies()).toEqual(["topics/topic"]);
  });

  it("finds dependency in correct directory with underscore", () => {
    const template = new FakeTemplate("<%= render(message_type.messages) %>", "tse");
    const tracker = makeTracker("message_types/_message_type", template);

    expect(tracker.dependencies()).toEqual(["messages/message"]);
  });

  it("dependency of tse template with no spaces after render", () => {
    const template = new FakeTemplate("<%= render'messages/message' %>", "tse");
    const tracker = makeTracker("messages/_message", template);

    expect(tracker.dependencies()).toEqual(["messages/message"]);
  });

  it("finds no dependency when render begins the name of an identifier", () => {
    const template = new FakeTemplate("<%= rendering 'it useless' %>", "tse");
    const tracker = makeTracker("resources/_resource", template);

    expect(tracker.dependencies()).toEqual([]);
  });

  it("finds no dependency when render ends the name of another method", () => {
    const template = new FakeTemplate("<%= surrender 'to reason' %>", "tse");
    const tracker = makeTracker("resources/_resource", template);

    expect(tracker.dependencies()).toEqual([]);
  });

  it("finds dependency on multiline render calls", () => {
    const template = new FakeTemplate(
      `<%=
      render object: this.allPosts,
             partial: 'posts' %>`,
      "tse",
    );

    const tracker = makeTracker("some/_little_posts", template);

    expect(tracker.dependencies()).toEqual(["some/posts"]);
  });

  it("finds multiple unrelated odd dependencies", () => {
    const template = new FakeTemplate(
      `
      <%= render('application/header', title: 'Title') %>
      <h2>Section title</h2>
      <%= render this.section %>
    `,
      "tse",
    );

    const tracker = makeTracker("multiple/_dependencies", template);

    expect(tracker.dependencies()).toEqual(["application/header", "sections/section"]);
  });

  it("finds dependencies for all kinds of identifiers", () => {
    const template = new FakeTemplate(
      `
      <%= render globals %>
      <%= render this.instance_variables %>
      <%= render class_variables %>
    `,
      "tse",
    );

    const tracker = makeTracker("identifiers/_all", template);

    expect(tracker.dependencies()).toEqual([
      "globals/global",
      "instance_variables/instance_variable",
      "class_variables/class_variable",
    ]);
  });

  it("finds dependencies on method chains", () => {
    const template = new FakeTemplate("<%= render this.parent.child.grandchildren %>", "tse");
    const tracker = makeTracker("method/_chains", template);

    expect(tracker.dependencies()).toEqual(["grandchildren/grandchild"]);
  });

  it("finds dependencies with special characters", () => {
    const template = new FakeTemplate(
      "<%= render partial: 'ピカチュウ', object: this.pokémon %>",
      "tse",
    );
    const tracker = makeTracker("special/_characters", template);

    expect(tracker.dependencies()).toEqual(["special/ピカチュウ"]);
  });

  it("finds dependencies with quotes within", () => {
    const template = new FakeTemplate(
      `
      <%= render "single/quote's" %>
      <%= render 'double/quote"s' %>
    `,
      "tse",
    );

    const tracker = makeTracker("quotes/_single_and_double", template);

    expect(tracker.dependencies()).toEqual(["single/quote's", 'double/quote"s']);
  });

  it("finds dependencies with extra spaces", () => {
    const template = new FakeTemplate(
      `
      <%= render              "header" %>
      <%= render    partial:  "form" %>
      <%= render              this.message %>
      <%= render ( this.message.events ) %>
      <%= render    collection: this.message.comments,
                    partial:    "comments/comment" %>
    `,
      "tse",
    );

    const tracker = makeTracker("spaces/_extra", template);

    expect(tracker.dependencies()).toEqual([
      "spaces/header",
      "spaces/form",
      "messages/message",
      "events/event",
      "comments/comment",
    ]);
  });

  it("finds dependencies with bare assoc hash on constant", () => {
    const template = new FakeTemplate(
      `
      <%= render SomeConstant.message({ this: "that" }) %>
    `,
      "tse",
    );

    const tracker = makeTracker("assoc_hash/const", template);

    expect(tracker.dependencies()).toEqual(["messages/message"]);
  });

  it("dependencies with interpolation", () => {
    const template = new FakeTemplate(
      `
      <%= render \`double/\${quote}\` %>
      <%= render 'single/\${quote}' %>
    `,
      "tse",
    );
    const tracker = makeTracker("interpolation/_string", template);

    expect(tracker.dependencies()).toEqual(["single/${quote}"]);
  });

  it("dependencies with interpolation are resolved with view paths", () => {
    const viewPaths = digestorViewPaths();

    const template = new FakeTemplate(
      `
      <%= render \`events/\${quote}\` %>
    `,
      "tse",
    );

    const tracker = makeTracker("interpolation/_string", template, viewPaths);

    expect(tracker.dependencies()).toEqual(["events/_completed", "events/_event", "events/index"]);
  });

  it("dependencies with interpolation non trailing", () => {
    const viewPaths = digestorViewPaths();

    const template = new FakeTemplate(
      `
      <%= render \`\${type}/comments\` %>
    `,
      "tse",
    );

    const tracker = makeTracker("interpolation/_string", template, viewPaths);

    expect(tracker.dependencies()).toEqual(["*/comments"]);
  });
});
