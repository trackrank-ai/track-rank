// Preserve the original encoding and order of content parameters and fragments.
export const attributionKeys = ["gclid", "dclid", "fbclid", "msclkid"] as const;
export function citationPageKey(url: string) {
  const hash = url.indexOf("#");
  const address = hash < 0 ? url : url.slice(0, hash);
  const query = address.indexOf("?");
  if (query < 0) return url;
  const parts = address.slice(query + 1).split("&");
  const kept = parts.filter(part => {
    const key = part.split("=", 1)[0].toLowerCase();
    return !key.startsWith("utm_") && !attributionKeys.some(value => value === key);
  });
  if (kept.length === parts.length) return url;
  return address.slice(0, query) + (kept.join("&") ? "?" + kept.join("&") : "") + (hash < 0 ? "" : url.slice(hash));
}
