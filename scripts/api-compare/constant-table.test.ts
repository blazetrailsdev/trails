import { describe, expect, it } from "vitest";
import { derivedConstantPath } from "./constant-table.js";

describe("derivedConstantPath", () => {
  it("reads a namespace off the directories, under the gem's root", async () => {
    expect(
      await derivedConstantPath("activejob", "queue-adapters/test-adapter.ts", "TestAdapter"),
    ).toBe("ActiveJob::QueueAdapters::TestAdapter");
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

  it("nests a second class in its file, or sets it beside the file's own for a siblings layout", async () => {
    expect(await derivedConstantPath("actioncable", "server/base.ts", "Config")).toBe(
      "ActionCable::Server::Base::Config",
    );
    expect(await derivedConstantPath("arel", "nodes/binary.ts", "Between")).toBe(
      "Arel::Nodes::Between",
    );
  });

  it("names a renamed class by its Ruby cname and keeps a brand rename", async () => {
    expect(await derivedConstantPath("activemodel", "name.ts", "ModelName")).toBe(
      "ActiveModel::Name",
    );
    expect(await derivedConstantPath("trailties", "trailtie.ts", "Trailtie")).toBe(
      "Rails::Trailtie",
    );
  });

  it("leaves a folded file's own cname and takes a renamed file's", async () => {
    expect(await derivedConstantPath("activesupport", "inflector.ts", "Inflector")).toBe(
      "ActiveSupport::Inflector",
    );
    expect(
      await derivedConstantPath("actionview", "dependency-tracker/tse-tracker.ts", "RubyTracker"),
    ).toBe("ActionView::DependencyTracker::RubyTracker");
  });

  it("reaches GemInflector's version arm", async () => {
    expect(await derivedConstantPath("activejob", "gem-version.ts", "VERSION")).toBe(
      "ActiveJob::VERSION",
    );
    expect(await derivedConstantPath("actionpack", "action-pack/gem-version.ts", "VERSION")).toBe(
      "ActionPack::VERSION",
    );
  });

  it("keeps a dotted name's owner", async () => {
    expect(await derivedConstantPath("rack-session", "cookie.ts", "Cookie.SessionId")).toBe(
      "Rack::Session::Cookie::SessionId",
    );
  });

  it("answers null for a segment cname_for refuses", async () => {
    expect(await derivedConstantPath("mail", "encodings/7bit.ts", "SevenBit")).toBeNull();
  });
});
