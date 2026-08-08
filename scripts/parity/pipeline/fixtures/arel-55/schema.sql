-- Fixture for statement: arel-55
-- Query: products.join(currency_rates) ORDER BY price * rate

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  currency_id INTEGER NOT NULL,
  price NUMERIC NOT NULL
);
CREATE TABLE currency_rates (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  rate NUMERIC NOT NULL,
  date DATE NOT NULL
);
CREATE INDEX idx_currency_rates_from_to ON currency_rates(from_id, to_id);
