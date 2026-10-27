import { Arguments as ActiveJobArguments } from "@blazetrails/activejob";
import { ActiveSupportJSON } from "@blazetrails/activesupport";
import { rbFArray, registerConstant } from "@blazetrails/ruby-compat";

export class Arguments {
  static load(data: string | null): unknown[] {
    return data == null ? [] : (ActiveSupportJSON.load(data) as unknown[]);
  }

  static dump(data: unknown): string {
    return ActiveSupportJSON.dump(ActiveJobArguments.serialize(rbFArray(data)));
  }
}

registerConstant("SolidQueue::RecurringTask::Arguments", Arguments);
