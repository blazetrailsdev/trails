import { htmlEscape } from "@blazetrails/activesupport";
import { env } from "@blazetrails/ruby-compat";
import { VERSION } from "./version.js";

export type InfoValue = string | string[];
export type PropertyEntry = [string, InfoValue];

export class PropertyList {
  entries: PropertyEntry[] = [];

  names(): string[] {
    return this.entries.map(([name]) => name);
  }

  valueFor(propertyName: string): InfoValue | undefined {
    const found = this.entries.find(([n]) => n === propertyName);
    return found ? found[1] : undefined;
  }
}

export class Info {
  static properties: PropertyList = new PropertyList();

  static property(name: string, value: InfoValue | (() => InfoValue | undefined)): void {
    try {
      const resolved = typeof value === "function" ? value() : value;
      if (resolved !== undefined && resolved !== null && resolved !== "") {
        Info.properties.entries.push([name, resolved]);
      }
    } catch {
      /** @empty */
    }
  }

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
