import { describe, expect, it } from "vitest";
import {
  namesMember,
  parseStory,
  rubyFileMentions,
  storySkipConflicts,
} from "./story-skip-conflicts.js";

describe("rubyFileMentions", () => {
  it("resolves a lib path to its package and root-relative file", () => {
    expect(
      rubyFileMentions("(`vendor/rails/activesupport/lib/active_support/test_case.rb:23-33`)"),
    ).toEqual([{ pkg: "activesupport", file: "test_case.rb" }]);
  });

  it("skips a file named without its gem", () => {
    expect(rubyFileMentions("`railtie.rb` and `connection_pool_test.rb`")).toEqual([]);
  });

  it("prefers the longer lib root", () => {
    expect(rubyFileMentions("lib/rack/session/cookie.rb")).toEqual([
      { pkg: "rack-session", file: "cookie.rb" },
    ]);
  });
});

describe("namesMember", () => {
  it("matches a name in code position, Ruby or TS spelling", () => {
    expect(namesMember("`TestCase.test_order`", "test_order")).toBe(true);
    expect(namesMember("no `testOrder` seat", "test_order")).toBe(true);
  });

  it("does not match prose or a longer name", () => {
    expect(namesMember("the test_order default", "test_order")).toBe(false);
    expect(namesMember("`test_order=`", "test_order")).toBe(false);
  });
});

describe("storySkipConflicts", () => {
  const body =
    "`vendor/rails/activesupport/lib/active_support/test_case.rb:23-33` has " +
    "`ActiveSupport::TestCase.test_order`, and `active_record/migration/compatibility.rb`.";

  it("lists an open story naming an unported file", () => {
    const conflicts = storySkipConflicts([{ id: "s", status: "ready", body }]);
    expect(conflicts.map((c) => [c.register, c.pkg, c.rubyFile])).toContainEqual([
      "unported-file",
      "activerecord",
      "migration/compatibility.rb",
    ]);
  });

  it("skips a done or closed story", () => {
    expect(storySkipConflicts([{ id: "s", status: "done", body }])).toEqual([]);
    expect(storySkipConflicts([{ id: "s", status: "closed", body }])).toEqual([]);
  });
});

describe("parseStory", () => {
  it("reads the status and drops the frontmatter", () => {
    expect(parseStory("s", "---\ntitle: x\nstatus: ready\n---\n\nbody\n")).toEqual({
      id: "s",
      status: "ready",
      body: "\nbody\n",
    });
  });
});
