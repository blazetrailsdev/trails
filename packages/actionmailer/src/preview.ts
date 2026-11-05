import {
  Concern,
  DescendantsTracker,
  camelize,
  constantize,
  extend,
  mattrAccessor,
  titleize,
  underscore,
} from "@blazetrails/activesupport";
import type { Message } from "@blazetrails/mail";
import {
  Dir,
  rbFRequireFile,
  rbModName,
  rbFSend,
  publicInstanceMethods,
} from "@blazetrails/ruby-compat";
import { InlinePreviewInterceptor } from "./inline-preview-interceptor.js";
import { ActionMailer } from "./namespaces.js";

export interface PreviewsClass {
  previewPaths: string[];
  showPreviews: boolean | null;
  previewInterceptors: unknown[];
}

export const ClassMethods = {
  registerPreviewInterceptors(this: PreviewsClass, ...interceptors: unknown[]): void {
    for (const interceptor of interceptors.flat(Infinity).filter((x) => x != null)) {
      ClassMethods.registerPreviewInterceptor.call(this, interceptor);
    }
  },

  unregisterPreviewInterceptors(this: PreviewsClass, ...interceptors: unknown[]): void {
    for (const interceptor of interceptors.flat(Infinity).filter((x) => x != null)) {
      ClassMethods.unregisterPreviewInterceptor.call(this, interceptor);
    }
  },

  registerPreviewInterceptor(this: PreviewsClass, interceptor: unknown): void {
    const previewInterceptor = ClassMethods.interceptorClassFor.call(this, interceptor);

    if (!this.previewInterceptors.includes(previewInterceptor)) {
      this.previewInterceptors.push(previewInterceptor);
    }
  },

  unregisterPreviewInterceptor(this: PreviewsClass, interceptor: unknown): void {
    const previewInterceptor = ClassMethods.interceptorClassFor.call(this, interceptor);
    const index = this.previewInterceptors.indexOf(previewInterceptor);
    if (index !== -1) this.previewInterceptors.splice(index, 1);
  },

  /** @internal */
  interceptorClassFor(this: PreviewsClass, interceptor: unknown): unknown {
    if (typeof interceptor === "string") {
      return constantize(camelize(interceptor));
    } else {
      return interceptor;
    }
  },
};

/** @internal */
export const Previews = { ClassMethods };
extend(Previews, Concern);
Concern.included.call(Previews as never, null, function (this: PreviewsClass) {
  mattrAccessor.call(this, "previewPaths", { instanceWriter: false, default: [] });
  mattrAccessor.call(this, "showPreviews", { instanceWriter: false });
  mattrAccessor.call(this, "previewInterceptors", {
    instanceWriter: false,
    default: [InlinePreviewInterceptor],
  });
});

export class Preview {
  declare static readonly descendants: (typeof Preview)[];

  readonly params: Record<string, unknown>;

  constructor(params: Record<string, unknown> = {}) {
    this.params = params;
  }

  static async all(): Promise<(typeof Preview)[]> {
    if (this.descendants.length === 0) await this.loadPreviews();
    return [...this.descendants].sort((a, b) => {
      const [x, y] = [titleize(rbModName(a)!), titleize(rbModName(b)!)];
      return x < y ? -1 : x > y ? 1 : 0;
    });
  }

  static call(email: string, params: Record<string, unknown> = {}): Message {
    const preview = new this(params);
    const message = rbFSend(preview, email) as Message;
    this.informPreviewInterceptors(message);
    return message;
  }

  static emails(): string[] {
    return publicInstanceMethods(this, false).sort();
  }

  static isEmailExists(email: string): boolean {
    return this.emails().includes(email);
  }

  static async isExists(preview: string): Promise<boolean> {
    return (await this.all()).some((p) => p.previewName() === preview);
  }

  static async find(preview: string): Promise<typeof Preview | undefined> {
    return (await this.all()).find((p) => p.previewName() === preview);
  }

  static previewName(): string {
    const name = rbModName(this)!;
    return underscore(name.endsWith("Preview") ? name.slice(0, -"Preview".length) : name);
  }

  /** @internal */
  private static async loadPreviews(): Promise<void> {
    for (const previewPath of this.previewPaths()) {
      for (const file of (await Dir.globAsync(`${previewPath}/**/*{-,_}preview.js`)).sort()) {
        await rbFRequireFile(file.slice(0, -".js".length));
      }
    }
  }

  /** @internal */
  private static previewPaths(): string[] {
    return (ActionMailer.Base as unknown as PreviewsClass).previewPaths;
  }

  /** @internal */
  private static showPreviews(): boolean | null {
    return (ActionMailer.Base as unknown as PreviewsClass).showPreviews;
  }

  /** @internal */
  private static informPreviewInterceptors(message: Message): void {
    for (const interceptor of (ActionMailer.Base as unknown as PreviewsClass).previewInterceptors) {
      (interceptor as typeof InlinePreviewInterceptor).previewingEmail(message);
    }
  }
}
extend(Preview, DescendantsTracker);

ActionMailer.Preview = Preview;
ActionMailer.Previews = Previews;
