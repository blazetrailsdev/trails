import { describe, it, expect } from "vitest";
import { generateFromSource } from "./index.js";
import { buildLinearization, indexModuleDefs, parseIncludeOrder } from "./linearization.js";

const BASE_RB = `
  module ActiveRecord
    class Base
      include Core
      include Persistence
      include Timestamp
    end
  end
`;
const CORE_RB = `
  module ActiveRecord
    module Core
      def touch(*names)
        1
      end
    end
  end
`;
const PERSISTENCE_RB = `
  module ActiveRecord
    module Persistence
      def touch(*names)
        super
      end
      def reload_only_here
        super
      end
    end
  end
`;
const TIMESTAMP_RB = `
  module ActiveRecord
    module Timestamp
      def touch(name, time)
        x = super(name)
        x
      end
    end
  end
`;

async function linearization() {
  return buildLinearization(BASE_RB, [CORE_RB, PERSISTENCE_RB, TIMESTAMP_RB]);
}

describe("super linearization", () => {
  it("reads the include order out of ActiveRecord::Base", async () => {
    expect(parseIncludeOrder(BASE_RB)).toEqual(["Core", "Persistence", "Timestamp"]);
  });

  it("indexes the methods each vendored module defines", async () => {
    const defs = await indexModuleDefs([CORE_RB, PERSISTENCE_RB]);
    expect([...(defs.get("Core") ?? [])]).toEqual(["touch"]);
    expect([...(defs.get("Persistence") ?? [])]).toEqual(["touch", "reload_only_here"]);
  });

  it("resolves a super to the next definer in the ancestry", async () => {
    const lin = await linearization();
    expect(lin.resolve("Timestamp", "touch")).toEqual({
      kind: "resolved",
      module: "Persistence",
      method: "touch",
    });
    expect(lin.resolve("Persistence", "touch")).toEqual({
      kind: "resolved",
      module: "Core",
      method: "touch",
    });
  });

  it("declines a super with no further definer as outside the corpus", async () => {
    const lin = await linearization();
    expect(lin.resolve("Core", "touch")).toEqual({ kind: "outside-corpus" });
    expect(lin.resolve("Persistence", "reload_only_here")).toEqual({ kind: "outside-corpus" });
    expect(lin.resolve("ActiveModel::Naming", "touch")).toEqual({ kind: "outside-corpus" });
  });

  it("emits a value-position super as a direct next-definer call", async () => {
    const { code } = await generateFromSource(
      TIMESTAMP_RB,
      new Set(),
      "./runtime.js",
      await linearization(),
    );
    expect(code).toContain("x = Persistence.touch.call(this, name);");
    expect(code).not.toContain("__PRISM_TODO");
  });

  it("forwards the enclosing arguments through a bare super", async () => {
    const { code } = await generateFromSource(
      PERSISTENCE_RB,
      new Set(),
      "./runtime.js",
      await linearization(),
    );
    expect(code).toContain("Core.touch.call(this, ...arguments)");
  });

  it("marks a super with no next definer as resolving outside the corpus", async () => {
    const { code } = await generateFromSource(
      PERSISTENCE_RB,
      new Set(),
      "./runtime.js",
      await linearization(),
    );
    expect(code).toContain('__PRISM_SUPER_OUTSIDE_CORPUS("Persistence#reload_only_here")');
  });

  it("counts an outside-corpus super as a decline, not a clean translation", async () => {
    const { perDef } = await generateFromSource(
      PERSISTENCE_RB,
      new Set(),
      "./runtime.js",
      await linearization(),
    );
    expect(perDef.get("touch")?.passthrough).toBe(0);
    expect(perDef.get("reloadOnlyHere")?.passthrough).toBe(1);
  });

  it("still flattens an unresolvable statement-position super", async () => {
    const { code } = await generateFromSource(
      `
        module ActiveRecord
          module Core
            def touch(*names)
              super
              1
            end
          end
        end
      `,
      new Set(),
      "./runtime.js",
      await linearization(),
    );
    expect(code).toContain("return 1;");
    expect(code).not.toContain("OUTSIDE_CORPUS");
    expect(code).not.toContain(".call(this");
  });

  it("leaves class-position super untouched when no linearization is supplied", async () => {
    const { code } = await generateFromSource(`
      class Widget < Base
        def save
          super
        end
      end
    `);
    expect(code).toContain("super(...arguments)");
  });
});
