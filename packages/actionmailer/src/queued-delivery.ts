import { Concern, DescendantsTracker, classAttribute, extend } from "@blazetrails/activesupport";
import { rbClassSuperclass } from "@blazetrails/ruby-compat";
import { MailDeliveryJob } from "./mail-delivery-job.js";
import { ActionMailer } from "./namespaces.js";

export const QueuedDelivery = {};
extend(QueuedDelivery, Concern);
Concern.included.call(QueuedDelivery as never, null, function (this: object) {
  classAttribute.call(this, "deliveryJob", { default: MailDeliveryJob });
  const deliveryJob = Object.getOwnPropertyDescriptor(this, "deliveryJob")!;
  const host = this as Parameters<typeof DescendantsTracker.registerSubclass>[1];
  const seat = (from: typeof host): void => {
    for (let klass = from; klass !== host; klass = rbClassSuperclass(klass)!) {
      DescendantsTracker.registerSubclass(rbClassSuperclass(klass)!, klass);
    }
  };
  Object.defineProperty(this, "deliveryJob", {
    ...deliveryJob,
    /** @inventedArm registerSubclass — PERMANENT */
    get(this: typeof host) {
      seat(this);
      return deliveryJob.get!.call(this);
    },
    /** @inventedArm registerSubclass — PERMANENT */
    set(this: typeof host, value: unknown) {
      deliveryJob.set!.call(this, value);
      seat(this);
    },
  });
  classAttribute.call(this, "deliverLaterQueueName", { default: "mailers" });
});

ActionMailer.QueuedDelivery = QueuedDelivery;
