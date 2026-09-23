import * as path from "path";
import { mkdir, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { describe, expect, it } from "vitest";
import {
  namesMember,
  parseStory,
  resolveRfcsDir,
  rubyFileMentions,
  storySkipConflicts,
} from "./story-skip-conflicts.js";

describe("rubyFileMentions", () => {
  const as = (file: string) => [{ pkg: "activesupport", file }];
  it.each([
    [
      "a lib path",
      "`vendor/rails/activesupport/lib/active_support/test_case.rb:23`",
      as("test_case.rb"),
    ],
    [
      "a bare path beside a namespaced constant",
      "`test_case.rb`, `ActiveSupport::TestCase`",
      as("test_case.rb"),
    ],
    [
      "a bare path beside a bare namespace",
      "ActiveSupport needs file_update_checker.rb",
      as("file_update_checker.rb"),
    ],
    [
      "the longer lib root",
      "lib/rack/session/cookie.rb",
      [{ pkg: "rack-session", file: "cookie.rb" }],
    ],
    [
      "a bare path to its rooted mention's package",
      "`globalid/lib/global_id/railtie.rb` calls `ActiveSupport.on_load` from `railtie.rb`",
      [{ pkg: "globalid", file: "railtie.rb" }],
    ],
    [
      "each bare mention by its own line",
      "`globalid/lib/global_id/railtie.rb`\n`ActiveSupport::Railtie` in `railtie.rb`",
      [
        { pkg: "globalid", file: "railtie.rb" },
        { pkg: "activesupport", file: "railtie.rb" },
      ],
    ],
    ["no gem for a bare path", "`railtie.rb` and `connection_pool_test.rb`", []],
    [
      "no gem when two are named",
      "`ActionView::Base`\n`ActiveSupport::Railtie`\n`railtie.rb:97`",
      [],
    ],
    ["no railties for a lone Rails", "Rails defines `fixtures.rb`", []],
    [
      "no gem under another gem's directory",
      "`actionmailer/railtie.rb`, `ActiveSupport::Railtie`",
      [],
    ],
  ])("resolves %s", (_, body, expected) => {
    expect(rubyFileMentions(body)).toEqual(expected);
  });
});

describe("namesMember", () => {
  it.each([
    ["`TestCase.test_order`", true],
    ["no `testOrder` seat", true],
    ["the test_order default", false],
    ["`test_order=`", false],
  ])("reads %s as %s", (body, expected) => {
    expect(namesMember(body, "test_order")).toBe(expected);
  });
});

describe("storySkipConflicts", () => {
  const body =
    "`active_record/migration/compatibility.rb` and `lib/rack/headers.rb` `Headers#key?`";
  const rows = (status: string) =>
    storySkipConflicts([{ id: "s", status, body }]).map((c) => [c.register, c.pkg, c.rubyFile]);

  it("lists an unported file, and no scoped skip the register mirrors in TS", () => {
    expect(rows("ready")).toEqual([
      ["unported-file", "activerecord", "migration/compatibility.rb"],
    ]);
  });

  it("skips a done or closed story", () => {
    expect([...rows("done"), ...rows("closed")]).toEqual([]);
  });
});

describe("parseStory", () => {
  it("reads the status and drops the frontmatter", () => {
    expect(parseStory("s", "---\nstatus: ready\n---\nbody\n")).toEqual({
      id: "s",
      status: "ready",
      body: "body\n",
    });
  });
});

describe("resolveRfcsDir", () => {
  it("takes the first candidate holding rfcs/ and skips missing ones", async () => {
    const checkout = await mkdtemp(path.join(tmpdir(), "tasks-"));
    await mkdir(path.join(checkout, "rfcs"));
    const missing = path.join(checkout, "absent");
    expect(await resolveRfcsDir([missing, checkout])).toBe(path.join(checkout, "rfcs"));
    expect(await resolveRfcsDir([missing])).toBeUndefined();
    await rm(checkout, { recursive: true });
  });
});
