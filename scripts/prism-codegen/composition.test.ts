import { describe, it, expect } from "vitest";
import {
  checkCompositionPoint,
  compositionFailureMessage,
  expectedCompositionOrder,
  indexSuperPositions,
  parseCompositionMarkers,
  realizedCompositionOrder,
  rubyPathCandidatesForModule,
  unresolvedAncestryMessage,
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

/** A definer of `initialize_internals_callback` with `body` as its statements. */
function definer(name: string, body: string): string {
  return `
    module ActiveRecord
      module ${name}
        def initialize_internals_callback
          ${body}
        end
      end
    end
  `;
}

const CORE_RB = definer("Core", "");
const INHERITANCE_RB = definer("Inheritance", "super\n          ensure_proper_type");
const SCOPING_RB = definer("Scoping", "super\n          populate_with_current_scope_attributes");
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

/** Expected order with `SCOPING_RB` swapped for a variant body. */
async function orderFor(scoping: string[]) {
  const sources = [BASE_RB, CORE_RB, INHERITANCE_RB, ...scoping];
  return expectedCompositionOrder(
    await buildLinearization(BASE_RB, sources),
    await indexSuperPositions(sources),
    "initialize_internals_callback",
  );
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
    expect(
      await orderFor([
        definer("Scoping", "populate_with_current_scope_attributes\n          super"),
      ]),
    ).toEqual(["Scoping", "Inheritance"]);
  });

  it("stops the chain at a definer that never calls super", async () => {
    expect(await orderFor([definer("Scoping", "populate_with_current_scope_attributes")])).toEqual([
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

  it("treats a bare reference as no call site", async () => {
    const { linearization, positions } = await inputs();
    const source = CONVERGED.replace(
      "applyScopeAttributes(ctor, this)",
      "const contribution = applyScopeAttributes",
    );
    expect(checkCompositionPoint(markerOf(source), source, linearization, positions)).toContain(
      "no call site below the marker: applyScopeAttributes",
    );
  });

  it("maps an ancestry entry to its vendored source paths, parent file last", () => {
    expect(rubyPathCandidatesForModule("Scoping")).toEqual(["active_record/scoping.rb"]);
    expect(rubyPathCandidatesForModule("ActiveRecord::Locking::Optimistic")).toEqual([
      "active_record/locking/optimistic.rb",
      "active_record/locking.rb",
    ]);
    expect(rubyPathCandidatesForModule("Marshalling::Methods")).toContain(
      "active_record/marshalling.rb",
    );
  });

  it("fails when an ancestry module's source did not load", () => {
    expect(unresolvedAncestryMessage([])).toBeUndefined();
    expect(unresolvedAncestryMessage(["ActiveModel::API"])).toBeUndefined();
    expect(unresolvedAncestryMessage(["Marshalling::Methods"])).toContain(
      "1 ancestry module(s) of ActiveRecord::Base have no vendored source",
    );
    expect(compositionFailureMessage([])).toBeUndefined();
  });
});
