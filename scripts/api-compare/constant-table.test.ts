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

  it("answers null for a segment cname_for refuses", async () => {
    expect(await derivedConstantPath("mail", "encodings/7bit.ts", "SevenBit")).toBeNull();
  });
});
