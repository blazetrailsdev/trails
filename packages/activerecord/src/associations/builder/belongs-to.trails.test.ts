import { describe, it, expect } from "vitest";
import { fixtures } from "../../test-fixtures.js";
import { Invoice } from "../../test-helpers/models/invoice.js";
import { LineItem } from "../../test-helpers/models/line-item.js";
import { registerModel } from "../../associations.js";

registerModel(Invoice);
registerModel(LineItem);

describe("Builder::BelongsTo.add_touch_callbacks", () => {
  fixtures([]);

  it("touches the old parent through changes_to_save when destroyed with an unsaved foreign key change", async () => {
    const lineItem = await LineItem.create({});
    const oldInvoice = await Invoice.create({ lineItems: [lineItem] });
    const newInvoice = await Invoice.create({});
    const past = new Date(Date.UTC(2000, 0, 1));
    await oldInvoice.updateColumns({ updated_at: past });
    await newInvoice.updateColumns({ updated_at: past });

    await oldInvoice.reload();
    const before = oldInvoice.updated_at;

    lineItem.invoice_id = newInvoice.id as number;
    await lineItem.destroy();

    await oldInvoice.reload();
    expect(oldInvoice.updated_at).not.toEqual(before);
  });
});
