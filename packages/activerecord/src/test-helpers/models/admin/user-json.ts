// vendor/rails/activerecord/test/models/admin/user_json.rb
import { Base } from "../../../base.js";

class Coder {
  #default: Record<string, unknown>;

  constructor(defaultVal: Record<string, unknown> = {}) {
    this.#default = defaultVal;
  }

  dump(o: unknown): string {
    return JSON.stringify(o ?? this.#default);
  }

  load(s: string | null | undefined): Record<string, unknown> {
    return s ? JSON.parse(s) : { ...this.#default };
  }
}

export class AdminUserJson extends Base {
  static _tableName = "admin_user_jsons";

  static {
    this.belongsTo("account", { className: "AdminAccount" });

    this.store("params", { accessors: ["token"], coder: JSON });
    this.store("settings", { accessors: ["color", "homepage"], coder: new Coder() });
    this.storeAccessor("settings", { accessors: ["favoriteFood"] });
    this.store("parent", { accessors: ["birthday", "name"], prefix: true, coder: new Coder() });
    this.store("spouse", { accessors: ["birthday"], prefix: "partner", coder: new Coder() });
    this.storeAccessor("spouse", { accessors: ["name"], prefix: "partner" });
    this.store("configs", { accessors: ["secretQuestion"], coder: new Coder() });
    this.store("configs", { accessors: ["twoFactorAuth"], suffix: true, coder: new Coder() });
    this.storeAccessor("configs", { accessors: ["loginRetry"], suffix: "config" });
    this.store("preferences", { accessors: ["rememberLogin"], coder: new Coder() });
    this.store("jsonData", { accessors: ["height", "weight"], coder: new Coder() });
    this.store("jsonDataEmpty", { accessors: ["isAGoodGuy"], coder: new Coder() });
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
