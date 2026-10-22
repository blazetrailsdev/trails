import { Concern, extend, toParam } from "@blazetrails/activesupport";
import { defineModule, rbModConstSet, rbObjClass, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { ActionCable, Channel } from "../namespaces.js";

interface BroadcastingClass {
  channelName: string;
  broadcastingFor(model: unknown): string;
  broadcastTo(model: unknown, message: unknown): Promise<unknown>;
}

interface BroadcastingServer {
  broadcast(broadcasting: unknown, message: unknown): Promise<unknown>;
}

export class ClassMethods {
  static broadcastTo(this: BroadcastingClass, model: unknown, message: unknown): Promise<unknown> {
    return (ActionCable.server() as BroadcastingServer).broadcast(
      this.broadcastingFor(model),
      message,
    );
  }

  static broadcastingFor(this: BroadcastingClass, model: unknown): string {
    return (this as unknown as typeof ClassMethods).serializeBroadcasting([
      this.channelName,
      model,
    ]) as string;
  }

  /** @internal */
  private static serializeBroadcasting(object: unknown): unknown {
    if (Array.isArray(object)) {
      return object.map((m) => this.serializeBroadcasting(m)).join(":");
    } else if (rbObjRespondTo(object, "toGidParam")) {
      return (object as { toGidParam(): string }).toGidParam();
    } else {
      return toParam(object);
    }
  }
}

export function broadcastingFor(this: unknown, model: unknown): string {
  return (rbObjClass(this) as unknown as BroadcastingClass).broadcastingFor(model);
}

export function broadcastTo(this: unknown, model: unknown, message: unknown): Promise<unknown> {
  return (rbObjClass(this) as unknown as BroadcastingClass).broadcastTo(model, message);
}

export const Broadcasting = defineModule({ broadcastingFor, broadcastTo });
extend(Broadcasting, Concern);
Object.defineProperty(Broadcasting, "ClassMethods", { value: ClassMethods });

rbModConstSet(Channel, "Broadcasting", Broadcasting);
