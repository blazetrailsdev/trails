import { FixtureSet as ActiveRecordFixtureSet } from "@blazetrails/activerecord/fixtures.js";
import type { FixtureSet as GlobalIDFixtureSet } from "@blazetrails/globalid";
import { ActionText } from "./action-text.js";
import { Attachable } from "./attachable.js";

export class FixtureSet {
  static attachment(
    fixtureSetName: string,
    label: string,
    { columnType = ":integer" }: { columnType?: string } = {},
  ): string {
    const signedGlobalId = (
      ActiveRecordFixtureSet as typeof ActiveRecordFixtureSet & typeof GlobalIDFixtureSet
    ).signedGlobalId(fixtureSetName, label, {
      columnType: columnType,
      for: Attachable.LOCATOR_NAME,
    });

    return `<action-text-attachment sgid="${signedGlobalId}"></action-text-attachment>`;
  }
}

ActionText.FixtureSet = FixtureSet;
