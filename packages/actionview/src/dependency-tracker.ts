import type { PathSet } from "./path-set.js";
import type { Template } from "./template.js";
import { TemplateHandlers } from "./template/handlers.js";
import type { TemplateHandler } from "./template/handlers.js";
import { TSETracker } from "./dependency-tracker/tse-tracker.js";

/** @internal */
export interface Tracker {
  call(name: string, template: Template, viewPaths?: PathSet | null): string[];
  supportsViewPaths?(): boolean;
}

/** @internal */
export class DependencyTracker {
  static #trackers = new Map<TemplateHandler | null, Tracker>();

  static findDependencies(
    name: string,
    template: Template,
    viewPaths: PathSet | null = null,
  ): string[] {
    const tracker = DependencyTracker.#trackers.get(template.handler);
    if (!tracker) return [];

    return tracker.call(name, template, viewPaths);
  }

  static registerTracker(extension: string, tracker: Tracker): void {
    const handler = TemplateHandlers.handlerForExtension(extension) ?? null;
    if (typeof tracker.supportsViewPaths === "function") {
      DependencyTracker.#trackers.set(handler, tracker);
    } else {
      DependencyTracker.#trackers.set(handler, {
        call: (name, template, _) => tracker.call(name, template),
      });
    }
  }

  static removeTracker(handler: TemplateHandler | null): void {
    DependencyTracker.#trackers.delete(handler);
  }
}

DependencyTracker.registerTracker("tse", TSETracker);
