/**
 * ActionDispatch::Routing::RoutesInspector
 *
 * Formats routes for display (like `rails routes`).
 */

import type { Route } from "./route.js";

export interface InspectedRoute {
  name: string;
  verb: string;
  path: string;
  controller: string;
  action: string;
}

export class RoutesInspector {
  private routes: readonly Route[];

  constructor(routes: readonly Route[]) {
    this.routes = routes;
  }

  inspect(): InspectedRoute[] {
    return this.routes.map((route) => ({
      name: route.name ?? "",
      verb: route.verb,
      path: route.path,
      controller: route.controller,
      action: route.action,
    }));
  }

  format(): string {
    const rows = this.inspect();
    if (rows.length === 0) return "";

    // Calculate column widths
    const headers = ["Prefix", "Verb", "URI Pattern", "Controller#Action"];
    const data = rows.map((r) => [
      r.name,
      r.verb,
      r.path,
      r.controller && r.action ? `${r.controller}#${r.action}` : "",
    ]);

    const widths = headers.map((h, i) =>
      Math.max(h.length, ...data.map((row) => row[i].length))
    );

    const formatRow = (cols: string[]) =>
      cols.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();

    const lines = data.map(formatRow);
    return lines.join("\n");
  }
}
