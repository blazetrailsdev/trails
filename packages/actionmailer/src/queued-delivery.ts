import { Concern, classAttribute, extend } from "@blazetrails/activesupport";
import { MailDeliveryJob } from "./mail-delivery-job.js";
import { ActionMailer } from "./namespaces.js";

export const QueuedDelivery = {};
extend(QueuedDelivery, Concern);
Concern.included.call(QueuedDelivery as never, null, function (this: object) {
  classAttribute.call(this, "deliveryJob", { default: MailDeliveryJob });
  classAttribute.call(this, "deliverLaterQueueName", { default: "mailers" });
});

ActionMailer.QueuedDelivery = QueuedDelivery;
