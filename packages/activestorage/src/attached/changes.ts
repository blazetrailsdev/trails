import { Autoload, extend } from "@blazetrails/activesupport";
import type { AutoloadModule } from "../active-storage.js";
import { Attached } from "../attached.js";
import type { CreateOne } from "./changes/create-one.js";
import type { DeleteOne } from "./changes/delete-one.js";
import type { DetachOne } from "./changes/detach-one.js";
import type { PurgeOne } from "./changes/purge-one.js";

export const Changes = {
  name: "ActiveStorage::Attached::Changes",
  loadPath: {} as Record<string, () => Promise<unknown>>,
} as AutoloadModule & {
  CreateOne: typeof CreateOne;
  DeleteOne: typeof DeleteOne;
  DetachOne: typeof DetachOne;
  PurgeOne: typeof PurgeOne;
};
extend(Changes, Autoload);

Changes.eagerAutoload(() => {
  Changes.autoload("CreateOne");

  Changes.autoload("DeleteOne");

  Changes.autoload("DetachOne");

  Changes.autoload("PurgeOne");
});

Attached.Changes = Changes;
