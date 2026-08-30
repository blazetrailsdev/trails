import type { HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { Base } from "../../../base.js";
import { YAMLColumn } from "../../../coders/yaml-column.js";

class Coder {
  #default: Record<string, unknown>;

  constructor(defaultVal: Record<string, unknown> = {}) {
    this.#default = defaultVal;
  }

  dump(o: unknown): string {
    return JSON.stringify(o ?? this.#default);
  }

  load(s: string | null | undefined): Record<string, unknown> {
    if (!s) return { ...this.#default };
    return JSON.parse(s);
  }
}

export class AdminUser extends Base {
  declare configs: HashWithIndifferentAccess<unknown>;
  declare params: HashWithIndifferentAccess<unknown>;
  declare settings: HashWithIndifferentAccess<unknown>;
  declare spouse: HashWithIndifferentAccess<unknown>;
  static _tableName = "admin_users";
  static moduleName = "Admin";
  static _demodulizedName = "User";

  static {
    this.belongsTo("account", { className: "AdminAccount" });

    this.store("params", { accessors: ["token"], coder: YAMLColumn });
    this.store("settings", { accessors: ["color", "homepage"] });
    this.storeAccessor("settings", "favoriteFood");
    this.store("parent", { accessors: ["birthday", "name"], prefix: true });
    this.store("spouse", { accessors: ["birthday"], prefix: "partner" });
    this.storeAccessor("spouse", "name", { prefix: "partner" });
    this.store("configs", { accessors: ["secretQuestion"] });
    this.store("configs", { accessors: ["twoFactorAuth"], suffix: true });
    this.storeAccessor("configs", "loginRetry", { suffix: "config" });
    this.store("preferences", { accessors: ["rememberLogin"] });
    this.store("json_data", { accessors: ["height", "weight"], coder: new Coder() });
    this.store("json_data_empty", { accessors: ["isAGoodGuy"], coder: new Coder() });
    this.storeAccessor("json_options", "enableFriendRequests");
  }

  get color(): unknown {
    return this.readStoreAttribute("settings", "color") ?? "red";
  }

  set color(value: string) {
    const allowed = ["black", "red", "green", "blue"];
    this.writeStoreAttribute("settings", "color", allowed.includes(value) ? value : "blue");
  }

  get phoneNumber(): string {
    return String(this.readStoreAttribute("settings", "phoneNumber") ?? "").replace(
      /(\d{3})(\d{3})(\d{4})/,
      "($1) $2-$3",
    );
  }

  set phoneNumber(value: string | null | undefined) {
    this.writeStoreAttribute(
      "settings",
      "phoneNumber",
      value ? value.replace(/[^\d]/g, "") : value,
    );
  }
}
