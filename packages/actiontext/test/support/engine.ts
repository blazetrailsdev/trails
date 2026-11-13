import { Base, Reflection } from "@blazetrails/activerecord";
import { onLoad } from "@blazetrails/activesupport";
import { ActiveStorage, Model } from "@blazetrails/activestorage";
import { ActiveRecordExtensions, ReflectionExtension } from "@blazetrails/activestorage/reflection";
import { File, include, prepend, rbObjSingletonClass } from "@blazetrails/ruby-compat";
import { ActionController } from "@blazetrails/actionpack";
import { ContentHelper } from "../../lib/content-helper.js";
import { ActionText } from "../../lib/action-text.js";
import { Attachable } from "../../lib/attachable.js";
import { Attribute } from "../../lib/attribute.js";
import { Encryption } from "../../lib/encryption.js";

for (const [mod, name] of [
  [ActionText, "action_text"],
  [ActiveStorage, "active_storage"],
] as const) {
  Object.defineProperty(mod, "tableNamePrefix", {
    configurable: true,
    get: () => `${Base.tableNamePrefix}${name}_`,
  });
}

include(Base, Model);
include(Base, ActiveRecordExtensions);
prepend(rbObjSingletonClass(Reflection), ReflectionExtension);

onLoad("active_record", (base: typeof Base) => {
  include(base, Attribute);
  prepend(base, Encryption);
});

await import("@blazetrails/activestorage/blob");
include(ActiveStorage.Blob!, Attachable);
await import("../../lib/rich-text.js");
await import("../../lib/encrypted-rich-text.js");

ActionController.Base.prependViewPath([File.expandPath("../../app/views", import.meta.dirname)]);
(ActionController.Base as unknown as { helper(mod: object): void }).helper(ContentHelper);
