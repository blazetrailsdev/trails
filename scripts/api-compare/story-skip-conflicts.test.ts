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
  it("resolves a lib path to its package and root-relative file", () => {
    expect(
      rubyFileMentions("(`vendor/rails/activesupport/lib/active_support/test_case.rb:23-33`)"),
    ).toEqual([{ pkg: "activesupport", file: "test_case.rb" }]);
  });

  it("skips a file named without its gem", () => {
    expect(rubyFileMentions("`railtie.rb` and `connection_pool_test.rb`")).toEqual([]);
  });

  it("resolves a bare path by the namespace the body names", () => {
    expect(rubyFileMentions("`test_case.rb` defines `ActiveSupport::TestCase.test_order`")).toEqual(
      [{ pkg: "activesupport", file: "test_case.rb" }],
    );
  });

  it("does not resolve a bare path under another gem's directory", () => {
    expect(rubyFileMentions("`actionmailer/railtie.rb` beside `ActiveSupport::Railtie`")).toEqual(
      [],
    );
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

  it("lists a scoped skip only when the register names no TS mirror", () => {
    const conflicts = storySkipConflicts([
      {
        id: "s",
        status: "ready",
        body: "`lib/rack/headers.rb` `Headers#key?`, ported as `hasKey`",
      },
    ]);
    expect(conflicts.filter((c) => c.register === "scoped-skip")).toEqual([]);
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
