import { useRef, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import type { ReactNode } from "react";
import { LegalLinks } from "@/components/legal-layout";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { REPOSITORY_URL } from "@/lib/pricing-estimate";
import "./public-layout.css";

export const SELF_HOST_URL = `${REPOSITORY_URL}/blob/main/docs/SELF_HOSTING.md`;

function PublicBrand() {
  return <a href="/" className="brand" aria-label="trackrank.ai home">
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M7 23V16M15 23V11M23 23V6" stroke="currentColor" strokeWidth="4" />
        <path d="M5 26H27" stroke="currentColor" strokeWidth="2" />
      </svg>
    </span>
    <span>trackrank<span className="public-brand-suffix">.ai</span></span>
  </a>;
}

export function PublicLayout({ children, page }: { children: ReactNode; page: "home" | "pricing" }) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  return <div className="public-page">
    <header className="public-header shell">
      <PublicBrand />
      <div className="public-header-actions" onKeyDown={event => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          menuButton.current?.focus();
        }
      }}>
        <Button ref={menuButton} type="button" variant="outline" className="public-menu" aria-expanded={open} aria-controls="public-nav" onClick={() => setOpen(value => !value)}>
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />} Menu
        </Button>
        <nav id="public-nav" className="public-nav" aria-label="Main navigation" data-open={open}>
          <a href={page === "home" ? "#product" : "/#product"} onClick={() => setOpen(false)}>Product</a>
          <a href="/pricing" aria-current={page === "pricing" ? "page" : undefined} onClick={() => setOpen(false)}>Pricing</a>
          <a href="#compare" onClick={() => setOpen(false)}>Compare</a>
          <a href={REPOSITORY_URL}>GitHub <ArrowUpRight size={14} aria-hidden="true" /></a>
        </nav>
        <ThemeToggle />
        <Button asChild size="sm" variant="outline"><a href="/login">Sign in</a></Button>
      </div>
    </header>
    <main className="shell">{children}</main>
    <footer className="public-footer shell">
      <PublicBrand />
      <LegalLinks />
      <span>© {new Date().getFullYear()} TrackRank · <a href={REPOSITORY_URL}>MIT licensed</a></span>
    </footer>
  </div>;
}

export function HostingActions({ hosted }: { hosted: boolean }) {
  return <div className="public-hosting">
    <div className="public-hosting-actions">
      {hosted && <Button asChild size="lg"><a href="/login?trial=start">Start hosted trial <ArrowUpRight aria-hidden="true" /></a></Button>}
      <Button asChild size="lg" variant={hosted ? "outline" : "default"}><a href={SELF_HOST_URL}>Self-host on Cloudflare <ArrowUpRight aria-hidden="true" /></a></Button>
    </div>
    {hosted && <p><strong>14 days free. No card or automatic charge.</strong> Collection requires your own DataForSEO account and incurs separate provider charges, including during the trial.</p>}
    {!hosted && <p>Deploy to your own Cloudflare account. Infrastructure and DataForSEO collection are billed separately.</p>}
  </div>;
}
