import { StringIO } from "@blazetrails/ruby-compat";
import { Blob } from "../blob.js";
import { Base, registerModel } from "@blazetrails/activerecord";
import type { AssociationProxy } from "@blazetrails/activerecord/associations/collection-proxy";

export class User extends Base {
  declare name: string | null;
  declare recordCallbacks: boolean | undefined;
  declare callbackCounter: number | undefined;

  static {
    this.validates("name", { presence: true });

    this.afterCommit((user: User) => user.incrementCallbackCounter());
  }

  incrementCallbackCounter(): void {
    if (this.recordCallbacks) {
      this.callbackCounter ??= 0;
      this.callbackCounter += 1;
    }
  }
}
registerModel(User);

export class Group extends Base {
  declare users: AssociationProxy<User>;

  static {
    this.hasMany("users", { autosave: true });

    this.acceptsNestedAttributesFor("users");
  }
}
registerModel(Group);

export async function createBlob({
  key = null,
  data = "Hello world!",
  filename = "hello.txt",
  contentType = "text/plain",
  identify = true,
  serviceName = null,
  record = null,
}: {
  key?: string | null;
  data?: string;
  filename?: string;
  contentType?: string | null;
  identify?: boolean;
  serviceName?: string | null;
  record?: unknown;
} = {}): Promise<Blob> {
  return await Blob.createAndUploadBang({
    key: key,
    io: new StringIO(data),
    filename: filename,
    contentType: contentType,
    identify: identify,
    serviceName: serviceName,
    record: record,
  });
}

export function buildBlobAfterUnfurling({
  key = null,
  data = "Hello world!",
  filename = "hello.txt",
  contentType = "text/plain",
  identify = true,
  record = null,
}: {
  key?: string | null;
  data?: string;
  filename?: string;
  contentType?: string | null;
  identify?: boolean;
  record?: unknown;
} = {}): Blob {
  return Blob.buildAfterUnfurling({
    key: key,
    io: new StringIO(data),
    filename: filename,
    contentType: contentType,
    identify: identify,
    record: record,
  });
}
