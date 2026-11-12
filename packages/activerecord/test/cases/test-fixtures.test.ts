import { describe, it, expect, beforeEach } from "vitest";
import {
  Dir,
  FileUtils,
  File as RubyFile,
  include,
  constSet,
  TopLevel,
} from "@blazetrails/ruby-compat";
import { Notifications, onLoad } from "@blazetrails/activesupport";
import { Minitest } from "@blazetrails/activesupport/testing/assertions";
import { Base } from "../../lib/base.js";
import "../../lib/relation.js";
import { TestFixtures } from "../../lib/test-fixtures.js";
import { fixtures } from "../../lib/test-helpers/use-fixtures.js";
import { ConnectionHandler } from "../../lib/connection-adapters/abstract/connection-handler.js";
import { inMemoryDb } from "../../lib/support/adapter-helper.js";
import { Zine } from "../models/zine.js";

constSet(TopLevel, "Zine", Zine);

describe("TestFixturesTest", () => {
  const { self } = fixtures([], { useTransactionalTests: false });

  let klass: new () => object;

  beforeEach(() => {
    klass = class {};
    include(klass, TestFixtures);
  });

  it("use transactional tests defaults to true", () => {
    expect(true).toEqual((klass as { useTransactionalTests?: unknown }).useTransactionalTests);
  });

  it("use transactional tests can be overridden", () => {
    (klass as { useTransactionalTests?: unknown }).useTransactionalTests = "foobar";

    expect("foobar").toEqual((klass as { useTransactionalTests?: unknown }).useTransactionalTests);
  });

  it("inclusion runs active record fixtures load hook", () => {
    onLoad("active_record_fixtures", function (base: { fixturePaths: string[] }) {
      base.fixturePaths.push("test/fixtures");
    });
    const klass = class {};

    include(klass, TestFixtures);

    expect((klass as unknown as { fixturePaths: string[] }).fixturePaths).toContain(
      "test/fixtures",
    );
  });

  it.skipIf(inMemoryDb())("doesnt rely on active support test case specific methods", async () => {
    const tmpDir = Dir.mktmpdir();
    let oldHandler: ConnectionHandler | undefined;
    try {
      RubyFile.write(RubyFile.join(tmpDir, "zines.yml"), "going_out:\n  title: Hello\n");

      const klass = class extends Minitest.Test {
        declare static fixturePaths: string[];
        declare static useTransactionalTests: boolean;
        declare static fixtures: (...fixtureSetNames: unknown[]) => void;
        declare zines: (name: string) => Promise<Zine>;

        static {
          include(this, TestFixtures);

          this.fixturePaths = [tmpDir];
          this.useTransactionalTests = true;

          this.fixtures(":all");
        }

        async testRunSuccessfully() {
          expect(((await Zine.first()) as Zine).title).toBe("Hello");
          expect((await this.zines("going_out")).title).toBe("Hello");
        }
      };

      Notifications.unsubscribe(self()._connectionSubscriber);
      self()._connectionSubscriber = null;

      oldHandler = Base.connectionHandler;
      Base.connectionHandler = new ConnectionHandler();
      await Base.establishConnection(":arunit");

      const testResult = await new klass("testRunSuccessfully").run();
      expect(testResult.isPassed()).toBeTruthy();
    } finally {
      Base.connectionHandler = oldHandler!;
      self().cleanUpConnectionHandler();
      FileUtils.rmR(tmpDir);
    }
  });
});
