import { describe, it, expect } from "vitest";
import { tutorials, getTutorial } from "./registry.js";

describe("tutorial registry", () => {
  it("has registered tutorials", () => {
    expect(tutorials.length).toBeGreaterThan(0);
  });

  it("each tutorial has required fields", () => {
    for (const t of tutorials) {
      expect(t.slug).toBeTruthy();
      expect(t.title).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.stepCount).toBeGreaterThan(0);
      expect(typeof t.loadSteps).toBe("function");
    }
  });

  it("tutorials have unique slugs", () => {
    const slugs = tutorials.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("getTutorial returns correct entry by slug", () => {
    const docs = getTutorial("docs");
    expect(docs?.slug).toBe("docs");
    expect(docs?.title).toBe("Getting Started");
  });

  it("getTutorial returns undefined for unknown slug", () => {
    expect(getTutorial("unknown")).toBeUndefined();
  });

  it("docs tutorial steps load successfully", async () => {
    const docs = getTutorial("docs")!;
    const steps = await docs.loadSteps();
    expect(steps.length).toBe(docs.stepCount);
  });

  it("each docs step has required structure", async () => {
    const docs = getTutorial("docs")!;
    const steps = await docs.loadSteps();
    for (const step of steps) {
      expect(step.title).toBeTruthy();
      expect(step.panes.length).toBeGreaterThan(0);
      expect(step.description.length).toBeGreaterThan(0);
      expect(step.actions.length).toBeGreaterThan(0);
      expect(step.checkpoint.length).toBeGreaterThan(0);
    }
  });

  it("docs step 1 has a diagram", async () => {
    const docs = getTutorial("docs")!;
    const steps = await docs.loadSteps();
    expect(steps[0].diagram).toBeTruthy();
    expect(steps[0].diagramLabel).toBeTruthy();
  });

  it("docs step 2 introduces database pane", async () => {
    const docs = getTutorial("docs")!;
    const steps = await docs.loadSteps();
    expect(steps[0].panes).not.toContain("database");
    expect(steps[1].panes).toContain("database");
  });

  it("stepCount matches actual loaded steps", async () => {
    for (const t of tutorials) {
      const steps = await t.loadSteps();
      expect(steps.length).toBe(t.stepCount);
    }
  });
});
