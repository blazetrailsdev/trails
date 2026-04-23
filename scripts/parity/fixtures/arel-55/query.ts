import { Table, star } from "@blazetrails/arel";
const products = new Table("products");
const currencyRates = new Table("currency_rates");
products
  .join(currencyRates)
  .on(products.get("currency_id").eq(currencyRates.get("id")))
  .project(star)
  .order(products.get("price").multiply(currencyRates.get("rate")));
