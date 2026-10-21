import { beforeEach, describe, it } from "vitest";
import "../test-helpers/abstract-unit.js";
import "../test-helpers/active-record-unit.js";
import { ActionController } from "@blazetrails/actionpack";
import { assertQueriesCount } from "@blazetrails/activerecord/testing/query-assertions";
import { MemoryStore, assertEqual } from "@blazetrails/activesupport";
import { CacheHelper } from "../helpers/cache-helper.js";
import { LookupContext } from "../lookup-context.js";
import { Renderer } from "../renderer.js";
import { TestCase } from "../test-case.js";
import { Project } from "../test-helpers/fixtures/project.js";

interface Tc {
  viewRenderer: Renderer;
  virtualPath: string;
  currentTemplate: unknown;
  controller: { cacheStore: MemoryStore };
  cache(name: unknown, options: Record<string, unknown>, block: () => void): Promise<null>;
  concat(string: string): void;
  beforeSetup(): Promise<void>;
  setup(): void;
}

class RelationCacheTest extends TestCase {
  static {
    (this as unknown as { tests(helperClass: unknown): void }).tests(CacheHelper);
  }

  override setup(): void {
    super.setup();
    const self = this as unknown as Tc;
    const viewPaths = ActionController.Base.viewPaths();
    const lookupContext = new LookupContext(viewPaths, {}, ["test"]);
    self.viewRenderer = new Renderer(lookupContext);
    self.virtualPath = "path";
    self.currentTemplate = lookupContext.find("test/hello_world");

    self.controller.cacheStore = new MemoryStore();
  }

  viewCacheDependencies(): unknown[] {
    return [];
  }
}

describe("RelationCacheTest", () => {
  let tc: Tc;
  beforeEach(async ({ task }) => {
    tc = new RelationCacheTest(task.name) as unknown as Tc;
    await tc.beforeSetup();
    tc.setup();
  });

  // BLOCKED: relation-fragment-cache-name-awaits-async-cache-key
  it.skip("cache relation other", async () => {
    await assertQueriesCount(1, false, async () => {
      await tc.cache(Project.all(), {}, () => {
        tc.concat("Hello World");
      });
    });
    assertEqual(
      "Hello World",
      await tc.controller.cacheStore.read(
        `views/test/hello_world:fa9482a68ce25bf7589b8eddad72f736/projects-${await Project.count()}`,
      ),
    );
  });
});
