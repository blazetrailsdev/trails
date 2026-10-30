import { Autoload, extend } from "@blazetrails/activesupport";
import type { AutoloadModule } from "../active-storage.js";
import { Attached } from "../attached.js";
import type { CreateMany } from "./changes/create-many.js";
import type { CreateOne } from "./changes/create-one.js";
import type { CreateOneOfMany } from "./changes/create-one-of-many.js";
import type { DeleteMany } from "./changes/delete-many.js";
import type { DeleteOne } from "./changes/delete-one.js";
import type { DetachMany } from "./changes/detach-many.js";
import type { DetachOne } from "./changes/detach-one.js";
import type { PurgeMany } from "./changes/purge-many.js";
import type { PurgeOne } from "./changes/purge-one.js";

export const Changes = {
  name: "ActiveStorage::Attached::Changes",
  loadPath: {} as Record<string, () => Promise<unknown>>,
} as AutoloadModule & {
  CreateOne: typeof CreateOne;
  CreateMany: typeof CreateMany;
  CreateOneOfMany: typeof CreateOneOfMany;
  DeleteOne: typeof DeleteOne;
  DeleteMany: typeof DeleteMany;
  DetachOne: typeof DetachOne;
  DetachMany: typeof DetachMany;
  PurgeOne: typeof PurgeOne;
  PurgeMany: typeof PurgeMany;
};
extend(Changes, Autoload);

Changes.eagerAutoload(() => {
  Changes.autoload("CreateOne");
  Changes.autoload("CreateMany");
  Changes.autoload("CreateOneOfMany");

  Changes.autoload("DeleteOne");
  Changes.autoload("DeleteMany");

  Changes.autoload("DetachOne");
  Changes.autoload("DetachMany");

  Changes.autoload("PurgeOne");
  Changes.autoload("PurgeMany");
});

Attached.Changes = Changes;
