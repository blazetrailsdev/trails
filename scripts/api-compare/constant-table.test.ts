import { describe, expect, it } from "vitest";
import { derivedConstantPath, walkConstants } from "./constant-table.js";

describe("derivedConstantPath", () => {
  it("reads a namespace off the directories, under the package's root", async () => {
    expect(
      await derivedConstantPath("activejob", "queue-adapters/test-adapter.ts", "TestAdapter"),
    ).toBe("ActiveJob::QueueAdapters::TestAdapter");
  });

  it("takes a two-segment root from the package layout", async () => {
    expect(await derivedConstantPath("rack-test", "cookie-jar.ts", "CookieJar")).toBe(
      "Rack::Test::CookieJar",
    );
  });

  it("drops a collapsed directory", async () => {
    expect(
      await derivedConstantPath(
        "activerecord",
        "connection-adapters/abstract/quoting.ts",
        "Quoting",
      ),
    ).toBe("ActiveRecord::ConnectionAdapters::Quoting");
  });

  it("nests a second class in its file, or sets it beside the file's own", async () => {
    expect(await derivedConstantPath("actioncable", "server/base.ts", "Config")).toBe(
      "ActionCable::Server::Base::Config",
    );
    expect(await derivedConstantPath("arel", "nodes/binary.ts", "Between")).toBe(
      "Arel::Nodes::Between",
    );
  });

  it("names a renamed class and file by Ruby's cname, and keeps a brand rename", async () => {
    expect(await derivedConstantPath("activemodel", "naming.ts", "ModelName")).toBe(
      "ActiveModel::Name",
    );
    expect(await derivedConstantPath("trailties", "trailtie.ts", "Trailtie")).toBe(
      "Rails::Trailtie",
    );
    expect(
      await derivedConstantPath("actionview", "dependency-tracker/tse-tracker.ts", "RubyTracker"),
    ).toBe("ActionView::DependencyTracker::RubyTracker");
  });

  it("answers null for a segment cname_for refuses", async () => {
    expect(await derivedConstantPath("mail", "encodings/7bit.ts", "SevenBit")).toBeNull();
  });
});

describe("walkConstants", () => {
  it("walks a package's src and derives each exported class", async () => {
    const rows = await walkConstants("globalid");
    expect(rows.get("locator.ts::BaseLocator")).toBe("GlobalID::Locator::BaseLocator");
  });
});
