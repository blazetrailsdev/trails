import { afterEach, beforeEach, describe, it } from "vitest";
import "../test-helpers/abstract-unit.js";
import { ActiveRecordTestCase } from "../test-helpers/active-record-unit.js";
import { ActionController, RouteSet } from "@blazetrails/actionpack";
import { Conversion, Naming } from "@blazetrails/activemodel";
import { assertEqual, extend } from "@blazetrails/activesupport";
import { include } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "@blazetrails/activerecord";
import { Base } from "../base.js";
import { DetailsKey } from "../lookup-context.js";
import { FixtureResolver } from "../testing/resolvers.js";
import { Company } from "../test-helpers/fixtures/company.js";
import { Developer } from "../test-helpers/fixtures/developer.js";
import { Reply } from "../test-helpers/fixtures/reply.js";
import { Topic } from "../test-helpers/fixtures/topic.js";
import { Mascot } from "../test-helpers/fixtures/mascot.js";
import { Project } from "../test-helpers/fixtures/project.js";

type DrawCallback = Parameters<RouteSet["draw"]>[0];

declare module "../test-helpers/fixtures/developer.js" {
  interface Developer {
    projects: AssociationProxy<Project>;
  }
}
declare module "../test-helpers/fixtures/topic.js" {
  interface Topic {
    replies: AssociationProxy<Reply>;
  }
}
declare module "../test-helpers/fixtures/project.js" {
  interface Project {
    name: string;
  }
}
declare module "../test-helpers/fixtures/mascot.js" {
  interface Mascot {
    name: string;
  }
}
declare module "../test-helpers/fixtures/company.js" {
  interface Company {
    mascot: Promise<Mascot>;
  }
}

function testRoutes(klass: typeof ActionController.Base, block: DrawCallback): RouteSet {
  const routes = new RouteSet();
  routes.draw(block);
  include(klass, routes.urlHelpers());
  return routes;
}

const FIXTURE_LOAD_PATH = new FixtureResolver({
  "developers/_developer.html.tse": "<%= developer.name %>",
  "projects/_project.tse": "<%= project.name %>",
  "replies/_reply.tse": "<%= reply.content %>",
  "mascots/_mascot.html.tse": "<%= mascot.name %>",
  "test/_partial_only.tse": "only partial",
  "fun/games/_game.tse": "Fun <%= game.name %>\n",
  "fun/serious/games/_game.tse": "Serious <%= game.name %>\n",
  "games/_game.tse": "Just <%= game.name %>\n",
});
ActionController.Base.viewPaths([FIXTURE_LOAD_PATH]);

type Body = { response: { body: string } };

async function run<T extends ActiveRecordTestCase>(
  klass: new (name: string) => T,
  name: string,
  block: (tc: T & Body) => Promise<void>,
): Promise<void> {
  const tc = new klass(name) as T & Body;
  await tc.beforeSetup();
  tc.setup();
  try {
    await block(tc);
  } finally {
    tc.teardown();
  }
}

class RenderPartialWithRecordIdentificationController extends ActionController.Base {
  static ROUTES = testRoutes(this, function () {
    for (const action of [
      "renderWithRecordCollection",
      "renderWithScope",
      "renderWithRecord",
      "renderWithHasManyAssociation",
      "renderWithHasManyAndBelongsToAssociation",
      "renderWithHasOneAssociation",
      "renderWithRecordCollectionAndSpacerTemplate",
    ]) {
      this.get(action, { to: `render_partial_with_record_identification#${action}` });
    }
  });

  declare developer: Developer;
  declare topic: Topic;
  declare company: Company;
  declare developers: object;

  async renderWithHasManyAndBelongsToAssociation() {
    this.developer = await Developer.find(1);
    await this.render({ partial: this.developer.projects });
  }

  async renderWithHasManyAssociation() {
    this.topic = await Topic.find(1);
    await this.render({ partial: this.topic.replies });
  }

  async renderWithScope() {
    await this.render({ partial: (Reply as unknown as { base(): object }).base() });
  }

  async renderWithHasOneAssociation() {
    this.company = await Company.find(1);
    await this.render({ partial: await this.company.mascot });
  }

  async renderWithRecord() {
    this.developer = (await Developer.first())!;
    await this.render({ partial: this.developer });
  }

  async renderWithRecordCollection() {
    this.developers = Developer.all();
    await this.render({ partial: this.developers });
  }

  async renderWithRecordCollectionAndSpacerTemplate() {
    this.developer = await Developer.find(1);
    await this.render({ partial: this.developer.projects, spacerTemplate: "test/partial_only" });
  }
}

class RenderPartialWithRecordIdentificationTest extends ActiveRecordTestCase {
  static {
    this.tests(RenderPartialWithRecordIdentificationController);
    this.fixtures(
      "developers",
      "projects",
      "developers_projects",
      "topics",
      "replies",
      "companies",
      "mascots",
    );
  }

  override setup(): void {
    super.setup();
    DetailsKey.clear();
  }
}

describe("RenderPartialWithRecordIdentificationTest", () => {
  const test = (
    name: string,
    block: (tc: RenderPartialWithRecordIdentificationTest & Body) => Promise<void>,
  ) => it(name, ({ task }) => run(RenderPartialWithRecordIdentificationTest, task.name, block));

  test("rendering partial with has many and belongs to association", async (tc) => {
    await tc.get("renderWithHasManyAndBelongsToAssociation");
    const projects = await (await Developer.find(1)).projects.toArray();
    assertEqual(projects.map((p) => p.name).join(""), tc.response.body);
  });

  test("rendering partial with has many association", async (tc) => {
    await tc.get("renderWithHasManyAssociation");
    assertEqual("Birdman is better!", tc.response.body);
  });

  test("rendering partial with scope", async (tc) => {
    await tc.get("renderWithScope");
    assertEqual("Birdman is better!Nuh uh!", tc.response.body);
  });

  test("render with record", async (tc) => {
    await tc.get("renderWithRecord");
    assertEqual("David", tc.response.body);
  });

  test("render with record collection", async (tc) => {
    await tc.get("renderWithRecordCollection");
    assertEqual(
      "DavidJamisfixture_3fixture_4fixture_5fixture_6fixture_7fixture_8fixture_9fixture_10Jamis",
      tc.response.body,
    );
  });

  test("render with record collection and spacer template", async (tc) => {
    await tc.get("renderWithRecordCollectionAndSpacerTemplate");
    const projects = await (await Developer.find(1)).projects.toArray();
    assertEqual(projects.map((p) => p.name).join("only partial"), tc.response.body);
  });

  test("rendering partial with has one association", async (tc) => {
    const mascot = await (await Company.find(1)).mascot;
    await tc.get("renderWithHasOneAssociation");
    assertEqual(mascot.name, tc.response.body);
  });
});

class Game {
  static {
    extend(this, Naming);
    include(this, Conversion);
  }

  constructor(
    public name: string,
    public id: unknown = null,
  ) {}

  toParam(): string {
    return this.id == null ? "" : String(this.id);
  }
}

const Fun = {
  NestedController: class NestedController extends ActionController.Base {
    static override controllerPath(): string {
      return "fun/nested";
    }

    static ROUTES = testRoutes(this, function () {
      this.get("renderWithRecordInNestedController", {
        to: "fun/nested#renderWithRecordInNestedController",
      });
      this.get("renderWithRecordCollectionInNestedController", {
        to: "fun/nested#renderWithRecordCollectionInNestedController",
      });
    });

    async renderWithRecordInNestedController() {
      await this.render({ partial: new Game("Pong") });
    }

    async renderWithRecordCollectionInNestedController() {
      await this.render({ partial: [new Game("Pong"), new Game("Tank")] });
    }
  },

  Serious: {
    NestedDeeperController: class NestedDeeperController extends ActionController.Base {
      static override controllerPath(): string {
        return "fun/serious/nested_deeper";
      }

      static ROUTES = testRoutes(this, function () {
        this.get("renderWithRecordInDeeperNestedController", {
          to: "fun/serious/nested_deeper#renderWithRecordInDeeperNestedController",
        });
        this.get("renderWithRecordCollectionInDeeperNestedController", {
          to: "fun/serious/nested_deeper#renderWithRecordCollectionInDeeperNestedController",
        });
      });

      async renderWithRecordInDeeperNestedController() {
        await this.render({ partial: new Game("Chess") });
      }

      async renderWithRecordCollectionInDeeperNestedController() {
        await this.render({
          partial: [new Game("Chess"), new Game("Sudoku"), new Game("Solitaire")],
        });
      }
    },
  },
};

class RenderPartialWithRecordIdentificationAndNestedControllersTest extends ActiveRecordTestCase {
  static {
    this.tests(Fun.NestedController);
  }
}

class RenderPartialWithRecordIdentificationAndNestedControllersWithoutPrefixTest extends ActiveRecordTestCase {
  static {
    this.tests(Fun.NestedController);
  }
}

class RenderPartialWithRecordIdentificationAndNestedDeeperControllersTest extends ActiveRecordTestCase {
  static {
    this.tests(Fun.Serious.NestedDeeperController);
  }
}

class RenderPartialWithRecordIdentificationAndNestedDeeperControllersWithoutPrefixTest extends ActiveRecordTestCase {
  static {
    this.tests(Fun.Serious.NestedDeeperController);
  }
}

describe("RenderPartialWithRecordIdentificationAndNestedControllersTest", () => {
  const klass = RenderPartialWithRecordIdentificationAndNestedControllersTest;

  it("render with record in nested controller", ({ task }) =>
    run(klass, task.name, async (tc) => {
      await tc.get("renderWithRecordInNestedController");
      assertEqual("Fun Pong\n", tc.response.body);
    }));

  it("render with record collection in nested controller", ({ task }) =>
    run(klass, task.name, async (tc) => {
      await tc.get("renderWithRecordCollectionInNestedController");
      assertEqual("Fun Pong\nFun Tank\n", tc.response.body);
    }));
});

describe("RenderPartialWithRecordIdentificationAndNestedControllersWithoutPrefixTest", () => {
  const klass = RenderPartialWithRecordIdentificationAndNestedControllersWithoutPrefixTest;
  let oldConfig: boolean;
  beforeEach(() => {
    oldConfig = Base.prefixPartialPathWithControllerNamespace;
  });
  afterEach(() => {
    Base.prefixPartialPathWithControllerNamespace = oldConfig;
  });

  it("render with record in nested controller", ({ task }) =>
    run(klass, task.name, async (tc) => {
      Base.prefixPartialPathWithControllerNamespace = false;

      await tc.get("renderWithRecordInNestedController");
      assertEqual("Just Pong\n", tc.response.body);
    }));

  it("render with record collection in nested controller", ({ task }) =>
    run(klass, task.name, async (tc) => {
      Base.prefixPartialPathWithControllerNamespace = false;

      await tc.get("renderWithRecordCollectionInNestedController");
      assertEqual("Just Pong\nJust Tank\n", tc.response.body);
    }));
});

describe("RenderPartialWithRecordIdentificationAndNestedDeeperControllersTest", () => {
  const klass = RenderPartialWithRecordIdentificationAndNestedDeeperControllersTest;

  it("render with record in deeper nested controller", ({ task }) =>
    run(klass, task.name, async (tc) => {
      await tc.get("renderWithRecordInDeeperNestedController");
      assertEqual("Serious Chess\n", tc.response.body);
    }));

  it("render with record collection in deeper nested controller", ({ task }) =>
    run(klass, task.name, async (tc) => {
      await tc.get("renderWithRecordCollectionInDeeperNestedController");
      assertEqual("Serious Chess\nSerious Sudoku\nSerious Solitaire\n", tc.response.body);
    }));
});

describe("RenderPartialWithRecordIdentificationAndNestedDeeperControllersWithoutPrefixTest", () => {
  const klass = RenderPartialWithRecordIdentificationAndNestedDeeperControllersWithoutPrefixTest;
  let oldConfig: boolean;
  beforeEach(() => {
    oldConfig = Base.prefixPartialPathWithControllerNamespace;
  });
  afterEach(() => {
    Base.prefixPartialPathWithControllerNamespace = oldConfig;
  });

  it("render with record in deeper nested controller", ({ task }) =>
    run(klass, task.name, async (tc) => {
      Base.prefixPartialPathWithControllerNamespace = false;

      await tc.get("renderWithRecordInDeeperNestedController");
      assertEqual("Just Chess\n", tc.response.body);
    }));

  it("render with record collection in deeper nested controller", ({ task }) =>
    run(klass, task.name, async (tc) => {
      Base.prefixPartialPathWithControllerNamespace = false;

      await tc.get("renderWithRecordCollectionInDeeperNestedController");
      assertEqual("Just Chess\nJust Sudoku\nJust Solitaire\n", tc.response.body);
    }));
});
