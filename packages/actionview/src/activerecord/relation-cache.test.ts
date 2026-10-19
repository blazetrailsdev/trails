import { describe, it } from "vitest";
import "../test-helpers/active-record-unit.js";
import { assertEqual } from "@blazetrails/activesupport";
import { Project } from "../test-helpers/fixtures/project.js";

type RelationCacheTest = {
  cache(name: unknown, block: () => void): Promise<void>;
  concat(string: string): void;
  controller: { cacheStore: { read(key: string): Promise<unknown> } };
  assertQueriesCount(count: number, block: () => Promise<void>): Promise<void>;
};

describe("RelationCacheTest", () => {
  // BLOCKED: port-template-test-case-test
  it.skip("cache relation other", async () => {
    const tc = null as unknown as RelationCacheTest;
    await tc.assertQueriesCount(1, async () => {
      await tc.cache(Project.all(), () => {
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
