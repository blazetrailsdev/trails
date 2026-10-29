import { CurrentAttributes } from "@blazetrails/activesupport";

export class Current extends CurrentAttributes {
  declare static userId: number | null;
  declare static username: string | null;

  static {
    this.attribute("userId", "username");
  }
}
