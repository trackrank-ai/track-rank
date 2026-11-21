import { useEffect, useState, type ReactNode } from "react";
export function trialDaysRemaining(endsAt: number, now: number) {
  return Math.max(0, Math.ceil((endsAt - now) / 86_400_000));
}
export function TrialBanner({ endsAt, children }: { endsAt: number; children: ReactNode }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const days = trialDaysRemaining(endsAt, now);
  return <aside className="trial-banner" aria-label="Free trial status">
    <p>You are on the free trial of our Starter plan. {days > 0 ? `Access expires in ${days} ${days === 1 ? "day" : "days"}.` : "Your trial is ending now."} Purchase a subscription to retain access.</p>
    {children}
  </aside>;
}
