import { fixMod } from "@blazetrails/ruby-compat";
import { Chronic } from "./namespaces.js";
import type { MiniDate } from "./mini-date.js";

export class Season {
  start: MiniDate;
  end: MiniDate;

  constructor(startDate: MiniDate, endDate: MiniDate) {
    this.start = startDate;
    this.end = endDate;
  }

  static findNextSeason(season: string, pointer: number): string {
    const lookup = ["spring", "summer", "autumn", "winter"];
    const nextSeasonNum = fixMod(lookup.indexOf(season) + 1 * pointer, 4);
    return lookup[nextSeasonNum];
  }

  static seasonAfter(season: string): string {
    return Season.findNextSeason(season, +1);
  }

  static seasonBefore(season: string): string {
    return Season.findNextSeason(season, -1);
  }
}

Chronic.Season = Season;
