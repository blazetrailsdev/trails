import { Concern, DescendantsTracker, classAttribute, extend } from "@blazetrails/activesupport";
import { rbClassSuperclass } from "@blazetrails/ruby-compat";
import { MailDeliveryJob } from "./mail-delivery-job.js";
import { ActionMailer } from "./namespaces.js";

export const QueuedDelivery = {};
extend(QueuedDelivery, Concern);
Concern.included.call(QueuedDelivery as never, null, function (this: object) {
  classAttribute.call(this, "deliveryJob", { default: MailDeliveryJob });
  const deliveryJob = Object.getOwnPropertyDescriptor(this, "deliveryJob")!;
  Object.defineProperty(this, "deliveryJob", {
    ...deliveryJob,
    set(this: object, value: unknown) {
      deliveryJob.set!.call(this, value);
      let klass = this as Parameters<typeof DescendantsTracker.registerSubclass>[1];
      for (let superclass; (superclass = rbClassSuperclass(klass)); klass = superclass) {
        DescendantsTracker.registerSubclass(superclass, klass);
      }
    },
  });
  classAttribute.call(this, "deliverLaterQueueName", { default: "mailers" });
});

ActionMailer.QueuedDelivery = QueuedDelivery;
