import { Notifications } from "@blazetrails/activesupport";
import { UploadedFile } from "@blazetrails/rack-test";
import { ActionController } from "@blazetrails/actionpack";
import { Image } from "@blazetrails/mini-magick/image";
import { File, IO, OpenSSL, StringIO } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "../active-storage.js";
import { Blob } from "../blob.js";
import { FixtureSet } from "../fixture-set.js";
import { Service } from "../service.js";
import type { DiskService } from "../service/disk-service.js";
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

FixtureSet.fileFixturePath = File.expandPath("fixtures/files", import.meta.dirname);

export const SERVICE_CONFIGURATIONS = {
  local: { service: "Disk", root: File.join(import.meta.dirname, "../../tmp/storage") },
};

function fileFixture(fixtureName: string): string {
  return new FixtureSet().fileFixture(fixtureName);
}

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

export async function createFileBlob({
  filename = "racecar.jpg",
  fixture = filename,
  contentType = "image/jpeg",
  identify = true,
  metadata = null,
  serviceName = null,
  record = null,
}: {
  key?: string | null;
  filename?: string;
  fixture?: string;
  contentType?: string | null;
  identify?: boolean;
  metadata?: { [k: string]: unknown } | null;
  serviceName?: string | null;
  record?: unknown;
} = {}): Promise<Blob> {
  return await Blob.createAndUploadBang({
    io: new StringIO((await IO.binreadAsync(fileFixture(fixture)))!),
    filename: filename,
    contentType: contentType,
    identify: identify,
    metadata: metadata,
    serviceName: serviceName,
    record: record,
  });
}

export async function createBlobBeforeDirectUpload({
  key = null,
  filename = "hello.txt",
  byteSize,
  checksum,
  contentType = "text/plain",
  record = null,
}: {
  key?: string | null;
  filename?: string;
  byteSize: number;
  checksum: string;
  contentType?: string | null;
  record?: unknown;
}): Promise<Blob> {
  return await Blob.createBeforeDirectUploadBang({
    key: key,
    filename: filename,
    byteSize: byteSize,
    checksum: checksum,
    contentType: contentType,
    record: record,
  });
}

export async function directlyUploadFileBlob({
  filename = "racecar.jpg",
  contentType = "image/jpeg",
  record = null,
}: { filename?: string; contentType?: string | null; record?: unknown } = {}): Promise<Blob> {
  const file = (await IO.binreadAsync(fileFixture(filename)))!;
  const byteSize = file.length;
  const checksum = OpenSSL.Digest.MD5.base64digest(file);

  const blob = await createBlobBeforeDirectUpload({
    filename: filename,
    byteSize: byteSize,
    checksum: checksum,
    contentType: contentType,
    record: record,
  });
  const service = (Blob.service as (Service & { primary?: Service }) | null)!;
  await (service.primary ?? service).upload(blob.key, new StringIO(file));
  return blob;
}

export async function readImage(blobOrVariant: { service: Service; key: string }) {
  return await Image.open((blobOrVariant.service as DiskService).pathFor(blobOrVariant.key));
}

export async function extractMetadataFrom(blob: Blob) {
  await (blob as Blob & { analyze(): Promise<void> }).analyze();
  return blob.readAttribute("metadata");
}

export function fixtureFileUpload(filename: string): UploadedFile {
  return new UploadedFile(fileFixture(filename));
}

export async function withService<T>(
  serviceName: string | null,
  block: () => T | Promise<T>,
): Promise<T> {
  const previousService = Blob.service;
  try {
    Blob.service = serviceName ? Blob.services.fetch(serviceName) : null;

    return await block();
  } finally {
    Blob.service = previousService;
  }
}

export async function withStrictLoadingByDefault<T>(block: () => T | Promise<T>): Promise<T> {
  const strictLoadingWas = Base.strictLoadingByDefault;
  try {
    Base.strictLoadingByDefault = true;
    return await block();
  } finally {
    Base.strictLoadingByDefault = strictLoadingWas;
  }
}

export async function withoutVariantTracking<T>(block: () => T | Promise<T>): Promise<T> {
  const variantTrackingWas = ActiveStorage.trackVariants;
  try {
    ActiveStorage.trackVariants = false;
    return await block();
  } finally {
    ActiveStorage.trackVariants = variantTrackingWas;
  }
}

export async function withRaiseOnOpenRedirects<T>(
  service: string,
  block: () => T | Promise<T>,
): Promise<T> {
  const oldRaiseOnOpenRedirects = ActionController.Base.raiseOnOpenRedirects;
  const oldService = Blob.service;
  try {
    ActionController.Base.raiseOnOpenRedirects = true;
    Blob.service = Service.configure(service, SERVICE_CONFIGURATIONS);
    return await block();
  } finally {
    ActionController.Base.raiseOnOpenRedirects = oldRaiseOnOpenRedirects;
    Blob.service = oldService;
  }
}

export function subscribeEventsFrom(name: string): unknown[] {
  const events: unknown[] = [];
  Notifications.subscribe(name, (event: unknown) => events.push(event));
  return events;
}
