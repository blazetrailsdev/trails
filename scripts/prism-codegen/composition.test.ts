import { describe, it, expect } from "vitest";
import {
  checkCompositionPoint,
  compositionFailureMessage,
  expectedCompositionOrder,
  indexSuperPositions,
  parseCompositionMarkers,
  realizedCompositionOrder,
  rubyPathForModule,
} from "./composition.js";
import { buildLinearization } from "./linearization.js";

const BASE_RB = `
  module ActiveRecord
    class Base
      include Core
      include Inheritance
      include Scoping
    end
  end
`;
const CORE_RB = `
  module ActiveRecord
    module Core
      def initialize_internals_callback
      end
    end
  end
`;
const INHERITANCE_RB = `
  module ActiveRecord
    module Inheritance
      def initialize_internals_callback
        super
        ensure_proper_type
      end
    end
  end
`;
const SCOPING_RB = `
  module ActiveRecord
    module Scoping
      def initialize_internals_callback
        super
        populate_with_current_scope_attributes
      end
    end
  end
`;
const SOURCES = [BASE_RB, CORE_RB, INHERITANCE_RB, SCOPING_RB];

const MARKER =
  "// prism-mro: initialize_internals_callback\n" +
  "//   Inheritance=inheritanceInitializeInternalsCallback\n" +
  "//   Scoping=applyScopeAttributes Core=~\n";

const CONVERGED = `${MARKER}
  inheritanceInitializeInternalsCallback.call(this);
  if (shouldApplyScopeAttributes(ctor)) applyScopeAttributes(ctor, this);
`;
const REORDERED = `${MARKER}
  if (shouldApplyScopeAttributes(ctor)) applyScopeAttributes(ctor, this);
  inheritanceInitializeInternalsCallback.call(this);
`;

async function inputs() {
  return {
    linearization: await buildLinearization(BASE_RB, SOURCES),
    positions: await indexSuperPositions(SOURCES),
  };
}

function markerOf(source: string) {
  return parseCompositionMarkers("base.ts", source)[0];
}

describe("composition-point MRO check", () => {
  it("parses a marker's ruby method and module bindings", () => {
    const marker = markerOf(CONVERGED);
    expect(marker.method).toBe("initialize_internals_callback");
    expect(marker.contributions).toEqual([
      { module: "Inheritance", identifier: "inheritanceInitializeInternalsCallback" },
      { module: "Scoping", identifier: "applyScopeAttributes" },
      { module: "Core", identifier: "~" },
    ]);
  });

  it("orders post-super contributions by reverse ancestry", async () => {
    const { linearization, positions } = await inputs();
    expect(linearization.ancestry).toEqual(["Scoping", "Inheritance", "Core"]);
    expect(
      expectedCompositionOrder(linearization, positions, "initialize_internals_callback"),
    ).toEqual(["Inheritance", "Scoping"]);
  });

  it("orders pre-super contributions by ancestry", async () => {
    const preSuper = SCOPING_RB.replace(
      "super\n        populate_with_current_scope_attributes",
      "populate_with_current_scope_attributes\n        super",
    );
    const sources = [BASE_RB, CORE_RB, INHERITANCE_RB, preSuper];
    expect(
      expectedCompositionOrder(
        await buildLinearization(BASE_RB, sources),
        await indexSuperPositions(sources),
        "initialize_internals_callback",
      ),
    ).toEqual(["Scoping", "Inheritance"]);
  });

  it("stops the chain at a definer that never calls super", async () => {
    const noSuper = SCOPING_RB.replace("super\n", "");
    const sources = [BASE_RB, CORE_RB, INHERITANCE_RB, noSuper];
    expect(
      expectedCompositionOrder(
        await buildLinearization(BASE_RB, sources),
        await indexSuperPositions(sources),
        "initialize_internals_callback",
      ),
    ).toEqual(["Scoping"]);
  });

  it("reads the realized order from the call sites below the marker", () => {
    expect(realizedCompositionOrder(markerOf(CONVERGED), CONVERGED).order).toEqual([
      "Inheritance",
      "Scoping",
    ]);
  });

  it("reads each composition point's own call sites, not the next point's", () => {
    const source = `${CONVERGED}\n${REORDERED}`;
    const [first, second] = parseCompositionMarkers("base.ts", source);
    expect(realizedCompositionOrder(first, source).order).toEqual(["Inheritance", "Scoping"]);
    expect(realizedCompositionOrder(second, source).order).toEqual(["Scoping", "Inheritance"]);
  });

  it("passes when the composition point matches the MRO", async () => {
    const { linearization, positions } = await inputs();
    expect(
      checkCompositionPoint(markerOf(CONVERGED), CONVERGED, linearization, positions),
    ).toBeUndefined();
  });

  it("fails when a composition point is reordered", async () => {
    const { linearization, positions } = await inputs();
    const failure = checkCompositionPoint(markerOf(REORDERED), REORDERED, linearization, positions);
    expect(failure).toContain("drifted from ActiveRecord::Base's MRO");
    expect(failure).toContain("MRO order:      Inheritance → Scoping");
    expect(failure).toContain("realized order: Scoping → Inheritance");
    expect(compositionFailureMessage([failure!])).toContain("1 composition point(s) drifted");
  });

  it("fails when a definer the MRO reaches is not declared", async () => {
    const { linearization, positions } = await inputs();
    const source = CONVERGED.replace(" Core=~", "");
    expect(checkCompositionPoint(markerOf(source), source, linearization, positions)).toContain(
      "not declared: Core",
    );
  });

  it("fails when a declared identifier has no call site below the marker", async () => {
    const { linearization, positions } = await inputs();
    const source = CONVERGED.replace(/applyScopeAttributes\(ctor, this\)/, "somethingElse()");
    expect(checkCompositionPoint(markerOf(source), source, linearization, positions)).toContain(
      "no call site below the marker: applyScopeAttributes",
    );
  });

  it("maps an ancestry entry to its vendored source path", () => {
    expect(rubyPathForModule("Scoping")).toBe("active_record/scoping.rb");
    expect(rubyPathForModule("ActiveRecord::Locking::Optimistic")).toBe(
      "active_record/locking/optimistic.rb",
    );
  });

  it("reports no failure when nothing drifted", () => {
    expect(compositionFailureMessage([])).toBeUndefined();
  });
});
