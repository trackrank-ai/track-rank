import { competitors } from "@/data/competitors";
import "./comparison-pages.css";

export function ComparisonLinks() {
  return <nav className="comparison-footer" aria-label="Comparisons and alternatives"><div><h2><a href="/vs">Compare Trackrank AI</a></h2>{competitors.map(item => <a key={item.slug} href={`/vs/${item.slug}`}>Trackrank AI vs {item.name}</a>)}</div><div><h2><a href="/alternatives">Alternatives</a></h2>{competitors.map(item => <a key={item.slug} href={`/alternatives/${item.slug}`}>{item.name} alternatives</a>)}</div></nav>;
}
