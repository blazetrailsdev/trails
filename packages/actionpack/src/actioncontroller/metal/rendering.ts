/**
 * ActionController::Rendering
 *
 * Render dispatch module mixed into controllers. Checks for double render
 * and processes render format priorities.
 * @see https://api.rubyonrails.org/classes/ActionController/Rendering.html
 */

import { Metal } from "../metal.js";

export const RENDER_FORMATS_IN_PRIORITY = ["body", "plain", "html"] as const;

export function renderInPriorities(options: Record<string, unknown>): unknown | null {
  for (const format of RENDER_FORMATS_IN_PRIORITY) {
    if (format in options) return options[format];
  }
  return null;
}

export function normalizeRenderOptions(options: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...options };

  if (normalized.status !== undefined && normalized.status !== null) {
    normalized.status = Metal.resolveStatus(normalized.status as number | string);
  }

  return normalized;
}

export function processRenderOptions(options: Record<string, unknown>): {
  status?: number;
  contentType?: string;
  location?: string;
} {
  const result: { status?: number; contentType?: string; location?: string } = {};
  if (options.status !== undefined && options.status !== null) {
    result.status = Metal.resolveStatus(options.status as number | string);
  }
  if (options.contentType || options.content_type)
    result.contentType = (options.contentType ?? options.content_type) as string;
  if (options.location) result.location = options.location as string;
  return result;
}
