import { Arguments as ActiveJobArguments } from "@blazetrails/activejob";
import { ActiveSupportJSON } from "@blazetrails/activesupport";
import { rbFArray } from "@blazetrails/ruby-compat";

export class Arguments {
  static toString(): string {
    return "SolidQueue::RecurringTask::Arguments";
  }

  static load(data: string | null): unknown[] {
    return data == null ? [] : (ActiveSupportJSON.load(data) as unknown[]);
  }

  static dump(data: unknown): string {
    return ActiveSupportJSON.dump(ActiveJobArguments.serialize(rbFArray(data)));
  }
}
