import { useEffect, useState, type ReactNode } from "react";
export function trialDaysRemaining(endsAt: number, now: number) {
  return Math.max(0, Math.ceil((endsAt - now) / 86_400_000));
}
export function TrialBanner({ endsAt, children }: { endsAt: number; children: ReactNode }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const days = trialDaysRemaining(endsAt, now);
  return <aside className="trial-banner" aria-label="Free trial status">
    <p>Starter plan trial · {days > 0 ? `Expires in ${days} ${days === 1 ? "day" : "days"}.` : "Your trial is ending now."} <span className="trial-detail">Purchase a subscription to retain access.</span></p>
    {children}
  </aside>;
}
