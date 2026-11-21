export function formatBillingPrice(offer: { price_cents: number; currency: string; interval: string }) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: offer.currency,
    minimumFractionDigits: offer.price_cents % 100 === 0 ? 0 : 2,
  }).format(offer.price_cents / 100) + `/${offer.interval}`;
}
