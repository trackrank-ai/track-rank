-- Price mappings survive offer withdrawal so Stripe can still reconcile subscriptions.
CREATE UNIQUE INDEX billing_prices_mode ON billing_prices(price_id, livemode);

CREATE TRIGGER billing_price_mapping_immutable
BEFORE UPDATE ON billing_prices
WHEN NEW.price_id <> OLD.price_id OR NEW.plan_version_id <> OLD.plan_version_id OR NEW.livemode <> OLD.livemode
BEGIN
  SELECT RAISE(ABORT, 'Use a new Stripe Price for a different plan revision');
END;

CREATE TRIGGER billing_price_mapping_no_delete
BEFORE DELETE ON billing_prices
BEGIN
  SELECT RAISE(ABORT, 'Withdraw the offer instead of deleting its Stripe Price mapping');
END;

CREATE TABLE billing_offers (
  offer_key TEXT NOT NULL CHECK(length(offer_key) BETWEEN 1 AND 64 AND offer_key GLOB '[a-z0-9]*' AND offer_key NOT GLOB '*[^a-z0-9-]*'),
  livemode INTEGER NOT NULL CHECK(livemode IN (0,1)),
  price_id TEXT NOT NULL,
  PRIMARY KEY (offer_key, livemode),
  FOREIGN KEY (price_id, livemode) REFERENCES billing_prices(price_id, livemode)
);

-- Start with an empty catalog. The deployment owner publishes verified offers.
