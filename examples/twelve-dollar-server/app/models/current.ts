import { CurrentAttributes } from "@blazetrails/activesupport";

export class Current extends CurrentAttributes {
  declare static user_id: number | null;
  declare static username: string | null;

  static {
    this.attribute("user_id", "username");
  }
}
