import { defineModule } from "@blazetrails/activesupport";
import type { ActionController } from "@blazetrails/actionpack";
import { ActiveStorage } from "@blazetrails/activestorage";
import { VariantRecord } from "@blazetrails/activestorage/app/models/active-storage/variant-record.js";
import { isPresent } from "@blazetrails/activesupport";
import { Book } from "../../models/book.ts";
import { Markdown } from "../../../lib/trails-ext/action-text-markdown.ts";
import { SessionLookup } from "./authentication/session-lookup.ts";

type Blob = InstanceType<NonNullable<(typeof ActiveStorage)["Blob"]>>;
type OwningBook = { owningBook?(): Promise<Book | null> };

type Host = ActionController.Base &
  typeof SessionLookup & {
    blob?: Blob;
    blobForAuthorization(): Promise<Blob | null | undefined>;
    isReadable(blob: Blob | null | undefined): Promise<boolean>;
    owningBooksOf(blob: Blob): Promise<Book[]>;
  };

export const ActiveStorageAuthorization = defineModule({}, undefined, {
  ...SessionLookup,

  // A blob is as readable as the book it belongs to. Resolve that book on every
  // request, so unpublishing a book or revoking a reader takes effect on URLs that
  // were handed out before, the way it does for the book's text. A blob with no
  // book to authorize against fails closed.
  async requireReadableBlob(this: Host): Promise<void> {
    if (!(await this.isReadable(await this.blobForAuthorization()))) await this.head(":not_found");
  },

  async blobForAuthorization(this: Host): Promise<Blob | null | undefined> {
    return this.blob;
  },

  async isReadable(this: Host, blob: Blob | null | undefined): Promise<boolean> {
    const user = (await (await this.findSessionByCookie())?.user) ?? null;
    if (!isPresent(blob)) return false;
    for (const book of await this.owningBooksOf(blob!)) {
      if (book.published || (await book.isAccessable({ user }))) return true;
    }
    return false;
  },

  async owningBooksOf(this: Host, blob: Blob): Promise<Book[]> {
    const books: (Book | null | undefined)[] = [];
    for (const attachment of await ActiveStorage.Attachment!.where({
      blob_id: blob.id,
    }).toArray()) {
      const record = await (attachment as unknown as { record: Promise<unknown> }).record;
      if (record instanceof VariantRecord) {
        const variantBlob = await (record as unknown as { blob: Promise<Blob> }).blob;
        books.push(...(await this.owningBooksOf(variantBlob)));
      } else if (record instanceof Book) {
        books.push(record);
      } else if (record instanceof Markdown) {
        const owner = await (record as unknown as { record: Promise<OwningBook | null> }).record;
        books.push(await owner?.owningBook?.());
      } else {
        books.push(await (record as OwningBook | null)?.owningBook?.());
      }
    }
    return books.filter((book): book is Book => book != null);
  },
});
