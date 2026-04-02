import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types.js";
import { getTutorial } from "$lib/frontiers/tutorials/registry.js";

export const ssr = false;

export const load: PageLoad = ({ params }) => {
  const tutorial = getTutorial(params.tutorial);
  if (!tutorial) {
    throw error(404, { message: `Tutorial "${params.tutorial}" not found` });
  }

  const step = parseInt(params.step, 10);
  if (Number.isNaN(step) || step < 1 || step > tutorial.stepCount) {
    throw error(404, {
      message: `Step ${params.step} is out of range (1–${tutorial.stepCount})`,
    });
  }

  return {
    slug: tutorial.slug,
    title: tutorial.title,
    stepNumber: step,
    totalSteps: tutorial.stepCount,
    loadSteps: tutorial.loadSteps,
  };
};
