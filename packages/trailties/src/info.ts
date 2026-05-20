import { htmlEscape, env } from "@blazetrails/activesupport";
import { VERSION } from "./version.js";

// Port of railties/lib/rails/info.rb. Builds the runtime properties shown
// in InfoController responses (Trails version, environment, middleware, ...).

export type InfoValue = string | string[];
export type PropertyEntry = [string, InfoValue];

export class PropertyList {
  entries: PropertyEntry[] = [];

  names(): string[] {
    return this.entries.map(([name]) => name);
  }

  valueFor(name: string): InfoValue | undefined {
    const found = this.entries.find(([n]) => n === name);
    return found ? found[1] : undefined;
  }
}

export class Info {
  static properties: PropertyList = new PropertyList();

  /** Register a property. Block form lazy-evaluates; exceptions are swallowed. */
  static property(name: string, value: InfoValue | (() => InfoValue | undefined)): void {
    try {
      const resolved = typeof value === "function" ? value() : value;
      if (resolved !== undefined && resolved !== null && resolved !== "") {
        Info.properties.entries.push([name, resolved]);
      }
    } catch {
      // swallow per Rails: a failing property is simply omitted
    }
  }

  /** Plain-text rendering: aligned `name   value` rows under a header. */
  static toS(): string {
    const names = Info.properties.names();
    const width = names.reduce((max, n) => Math.max(max, n.length), 0);
    const rows = Info.properties.entries.map(([name, value]) => {
      const v = Array.isArray(value) ? value.join(", ") : value;
      return `${name.padEnd(width)}   ${v}`;
    });
    return ["About your application's environment", ...rows].join("\n");
  }

  static toString(): string {
    return Info.toS();
  }

  /** HTML rendering used by InfoController#properties. */
  static toHtml(): string {
    let table = "<table>";
    for (const [name, value] of Info.properties.entries) {
      table += `<tr><td class="name">${htmlEscape(name).toString()}</td>`;
      const formatted = Array.isArray(value)
        ? `<ul>${value.map((v) => `<li>${htmlEscape(String(v)).toString()}</li>`).join("")}</ul>`
        : htmlEscape(String(value)).toString();
      table += `<td class="value">${formatted}</td></tr>`;
    }
    table += "</table>";
    return table;
  }
}

Info.property("Trails version", VERSION);
Info.property("Environment", () => env.TRAILS_ENV ?? env.NODE_ENV ?? "development");
