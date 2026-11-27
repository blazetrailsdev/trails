import { defineModule, included } from "@blazetrails/activesupport";
import { SecureRandom } from "@blazetrails/ruby-compat";
import type { Base } from "@blazetrails/activerecord";

interface Host extends Base {
  join_code: string;
  generateJoinCode(): string;
}

export const Joinable = defineModule(
  {
    [included](base: typeof Base): void {
      base.beforeCreate(function (this: Host) {
        this.join_code = this.generateJoinCode();
      });
    },

    async resetJoinCode(this: Host): Promise<void> {
      await this.updateBang({ join_code: this.generateJoinCode() });
    },
  },
  undefined,
  {
    generateJoinCode(this: Host): string {
      return SecureRandom.alphanumeric(12).match(/.{4}/g)!.join("-");
    },
  },
);
