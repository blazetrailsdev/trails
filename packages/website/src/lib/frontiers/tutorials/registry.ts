import type { TutorialStep } from "./types.js";

export interface TutorialEntry {
  slug: string;
  title: string;
  description: string;
  stepCount: number;
  loadSteps: () => Promise<TutorialStep[]>;
}

export const tutorials: TutorialEntry[] = [
  {
    slug: "docs",
    title: "Getting Started",
    description: "Build a document management app with Users, Folders, and Documents.",
    stepCount: 2,
    loadSteps: async () => (await import("./docs/index.js")).steps,
  },
];

export function getTutorial(slug: string): TutorialEntry | undefined {
  return tutorials.find((t) => t.slug === slug);
}
