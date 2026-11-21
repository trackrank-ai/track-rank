import { Link, useLoaderData } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";

export const legal = { updated: "November 20, 2026" };
export function OperatorName() {
  return <>{useLoaderData({ from: "__root__" }).operator}</>;
}
export function LegalLinks() {
  return <nav className="legal-links" aria-label="Legal and support">
    <Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link>
    <Link to="/support">Support</Link><Link to="/security">Security</Link>
  </nav>;
}
export function ContactLink({ subject, children }: { subject: string; children?: ReactNode }) {
  const { email } = useLoaderData({ from: "__root__" });
  if (!email) return <span>contact your deployment administrator (support email not configured)</span>;
  return <a href={`mailto:${email}?subject=${encodeURIComponent(subject)}`}>{children || email}</a>;
}
export function LegalLayout({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <div className="legal-page shell">
    <header className="legal-header"><Link to="/">← TrackRank home</Link><ThemeToggle /></header>
    <main className="legal-content"><p className="section-eyebrow">TRACKRANK · EARLY BETA</p>
      <h1>{title}</h1><p className="legal-intro">{intro}</p>
      <p className="legal-meta">Last updated: {legal.updated} · Operated by <OperatorName /></p>
      {children}
    </main><footer className="legal-footer"><LegalLinks /><span>© {new Date().getFullYear()} <OperatorName /></span></footer>
  </div>;
}
