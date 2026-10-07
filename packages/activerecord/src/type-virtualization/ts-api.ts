/** @noRailsEquivalent CONVERGEABLE type-virtualization-leaves-the-activerecord-rails-matched-tree */
import { API } from "typescript/unstable/sync";

let api: API | undefined;

export function tsApi(): API {
  return (api ??= new API());
}
