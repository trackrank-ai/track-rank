import { parsePromptInput } from "@/lib/prompt-input";
import { Tooltip as HelpTooltip } from "radix-ui";
import { LegalLinks } from "@/components/legal-layout";
import { ThemeToggle } from "@/components/theme-toggle";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Building2,
  CalendarClock,
  Check,
  Copy,
  Download,
  ExternalLink,
  Fingerprint,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
export const Route = createFileRoute("/app")({ component: App });
// API JSON has heterogeneous result shapes; keep server secrets out of the client contract.
type Item = Record<string, any>;
type Tab =
  | "overview"
  | "prompts"
  | "research"
  | "runs"
  | "brands"
  | "schedules"
  | "team"
  | "settings"
  | "agents";
const nav: { id: Tab; label: string; Icon: typeof BarChart3 }[] = [
  { id: "overview", label: "Overview", Icon: BarChart3 },
  { id: "prompts", label: "Prompts", Icon: MessageSquare },
  { id: "research", label: "Sources & research", Icon: Link2 },
  { id: "runs", label: "Run history", Icon: BookOpen },
  { id: "brands", label: "Brands", Icon: Fingerprint },
  { id: "schedules", label: "Schedules", Icon: CalendarClock },
  { id: "team", label: "Team", Icon: Users },
  { id: "settings", label: "Settings", Icon: Settings2 },
  { id: "agents", label: "API & agents", Icon: KeyRound },
];
const engines: Record<string, string> = {
  chatgpt: "ChatGPT scraper",
  gemini: "Gemini scraper",
  google: "Google + AI Overviews",
};
const date = (t: number) => new Date(t).toLocaleString();
function PromptBatchPicker({prompts,selected,onChange}:{prompts:Item[];selected:string[];onChange:(ids:string[])=>void}) {
  const [filter,setFilter]=useState("");
  const filtered=prompts.filter(p=>(p.text+" "+engines[p.engine]).toLowerCase().includes(filter.toLowerCase()));
  const all=filtered.length>0 && filtered.every(p=>selected.includes(p.id));
  return <fieldset className="batch-picker"><legend>Select prompts ({selected.length} selected)</legend><input aria-label="Filter prompts to select" placeholder="Filter prompts or engines…" value={filter} onChange={e=>setFilter(e.target.value)} /><label className="check-field"><input type="checkbox" checked={all} onChange={e=>onChange(e.target.checked?[...new Set([...selected,...filtered.map(p=>p.id)])]:selected.filter(id=>!filtered.some(p=>p.id===id)))} /> Select all {filter?"matching":"shown"} ({filtered.length})</label><div className="batch-picker-list">{filtered.map(p=><label className="check-field" key={p.id}><input type="checkbox" checked={selected.includes(p.id)} onChange={e=>onChange(e.target.checked?[...selected,p.id]:selected.filter(id=>id!==p.id))} /><span>{p.text}<small>{engines[p.engine]}{!p.enabled?" · prompt paused":""}</small></span></label>)}</div></fieldset>;
}
function HelpTip({label,text}:{label:string;text:string}) {
  return <HelpTooltip.Provider delayDuration={150}><HelpTooltip.Root><HelpTooltip.Trigger asChild><span className="help-tip" tabIndex={0} role="button" aria-label={"About " + label}>ⓘ</span></HelpTooltip.Trigger><HelpTooltip.Portal><HelpTooltip.Content className="help-tip-content" sideOffset={6}>{text}<HelpTooltip.Arrow /></HelpTooltip.Content></HelpTooltip.Portal></HelpTooltip.Root></HelpTooltip.Provider>;
}
function FormField({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="app-field">
      <span>{label} {hint && <HelpTip label={label} text={hint} />}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <ScanIcon />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
function ScanIcon() {
  return <BarChart3 size={25} />;
}
function Status({ value }: { value: string }) {
  return (
    <Badge variant="outline" className={"run-status status-" + value}>
      {value}
    </Badge>
  );
}
function CopyValue({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}{" "}
      {copied ? "Copied" : label}
    </Button>
  );
}
type RunHistoryCursor = { before: number; beforeId: string };
const billingBlocksWorkspace = (status: unknown) =>
  status === "trial_expired" || status === "choose_plan" || status === "payment_required";

type PendingRunBatch = {
  prompt_ids: string[];
  repetitions: number;
  batch_key: string;
  accepted?: number;
};

function App() {
  const [selectedPromptIds,setSelectedPromptIds]=useState<string[]>([]);
  const [selectedScheduleIds,setSelectedScheduleIds]=useState<string[]>([]);
  const [runSamples,setRunSamples]=useState(1);
  const [scheduleSamples,setScheduleSamples]=useState(1);
  const [scheduleTimes,setScheduleTimes]=useState<string[]>(["09:00"]);
  const [scheduleFrequency,setScheduleFrequency]=useState("daily");
  const [scheduleDays,setScheduleDays]=useState<number[]>([1]);
  const [scheduleTimezone,setScheduleTimezone]=useState(()=>Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC");
  const [editingScheduleSelection,setEditingScheduleSelection]=useState(false);
  const [promptEngineChoices, setPromptEngineChoices] = useState<string[]>(["chatgpt"]);
  const [promptLocation, setPromptLocation] = useState("United States");
  const [promptLanguage, setPromptLanguage] = useState("en");
  const [locationQuery, setLocationQuery] = useState("");
  const [providerChoices, setProviderChoices] = useState<Item | null>(null);
  const [providerChoicesLoading, setProviderChoicesLoading] = useState(false);
  const [promptSeparator, setPromptSeparator] = useState("auto");
  const [session, setSession] = useState<Item | null>(null),
    [initializing, setInitializing] = useState(true),
    [orgs, setOrgs] = useState<Item[]>([]),
    [org, setOrg] = useState(""),
    [workspace, setWorkspace] = useState(""),
    [workspaces, setWorkspaces] = useState<Item[]>([]),
    [brands, setBrands] = useState<Item[]>([]),
    [prompts, setPrompts] = useState<Item[]>([]),
    [runs, setRuns] = useState<Item[]>([]),
    [schedules, setSchedules] = useState<Item[]>([]),
    [settings, setSettings] = useState<Item>({}),
    [billing, setBilling] = useState<Item>({}),
    [members, setMembers] = useState<Item[]>([]),
    [keys, setKeys] = useState<Item[]>([]),
    [invites, setInvites] = useState<Item[]>([]),
    [tab, setTab] = useState<Tab>("overview"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [loadedOrg, setLoadedOrg] = useState(""),
    [invite, setInvite] = useState(""),
    [pendingInvite, setPendingInvite] = useState<Item | null>(null),
    [newKey, setNewKey] = useState(""),
    [selectedRun, setSelectedRun] = useState<Item | null>(null),
    [editPrompt, setEditPrompt] = useState<Item | null>(null),
    [promptText, setPromptText] = useState(""),
    [ideas, setIdeas] = useState<string[]>([]),
    [nextRunCursor, setNextRunCursor] = useState<RunHistoryCursor | null>(null),
    [pendingBatch, setPendingBatch] = useState<{ scope: string; batch: PendingRunBatch } | null>(null);
  const batchInFlight = useRef(false);
  const batchScope = org && session ? `trackrank:pending-run:${session.user.id}:${org}` : "";
  const pendingRun = pendingBatch?.scope === batchScope ? pendingBatch.batch : null;
  const activeOrg = useRef(org);
  const latestLoad = useRef(0);
  activeOrg.current = org;
  useEffect(() => {
    if (!batchScope) return;
    try {
      const saved = sessionStorage.getItem(batchScope);
      setPendingBatch(saved ? { scope: batchScope, batch: JSON.parse(saved) as PendingRunBatch } : null);
    } catch {
      setPendingBatch(null);
    }
  }, [batchScope]);
  const orgReady = !!org && loadedOrg === org;
  const workspaceReady = orgReady && !billingBlocksWorkspace(billing.access_status);
  const isAdmin = workspaceReady && ["owner", "admin"].includes(settings.role),
    canWrite = workspaceReady && ["owner", "admin", "member"].includes(settings.role);
  const request = useCallback(
    async (
      path: string,
      method = "GET",
      data?: unknown,
      organization = org,
    ) => {
      const url =
        "/api/v1" +
        path +
        (organization
          ? (path.includes("?") ? "&" : "?") +
            "org=" +
            encodeURIComponent(organization)
          : "");
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      const d = (await r.json()) as Item;
      if (!r.ok) {
        if (r.status === 401) {
          location.assign("/login" + (new URLSearchParams(location.search).get("trial") === "start" ? "?trial=start" : "") + location.hash);
          throw new Error("Please sign in");
        }
        throw new Error(d.error || "Request failed");
      }
      return d;
    },
    [org],
  );
  const reloadOrgs = useCallback(async () => {
    const r = await fetch("/api/v1/organizations");
    const d = (await r.json()) as Item;
    if (!r.ok) throw new Error(d.error || "Unable to load organizations");
    setOrgs(d.organizations);
    setOrg((current) => current || d.organizations[0]?.id || "");
  }, []);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/api/auth/get-session"),
          s = (await r.json()) as Item;
        if (!s?.user) {
          location.assign("/login" + (new URLSearchParams(location.search).get("trial") === "start" ? "?trial=start" : "") + location.hash);
          return;
        }
        if (!mounted) return;
        setSession(s);
        const i = new URLSearchParams(location.hash.slice(1)).get("invite");
        if (i) {
          const details = await request("/invites/preview", "POST", { token: i }, "");
          setPendingInvite({ ...details, token: i });
        }
        if (new URLSearchParams(location.search).get("trial") === "start" && !i) {
          const organizations = await request("/organizations", "GET", undefined, "");
          if (!organizations.organizations.length) await request("/onboarding/trial", "POST", {}, "");
          history.replaceState(null, "", "/app");
        }
        await reloadOrgs();
      } catch (e) {
        if (mounted)
          setError(
            e instanceof Error ? e.message : "Unable to load application",
          );
      } finally {
        if (mounted) setInitializing(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
  const load = useCallback(async () => {
    if (!org || activeOrg.current !== org) return;
    const loadId = ++latestLoad.current;
    const isCurrent = () => activeOrg.current === org && latestLoad.current === loadId;
    setLoading(true);
    try {
      const billingState = await request("/billing");
      if (!isCurrent()) return;
      if (billingBlocksWorkspace(billingState.access_status)) {
        setBilling(billingState);
        setLoadedOrg(org);
        return;
      }
      const results = await Promise.all([
        request("/workspaces"),
        request("/brands"),
        request("/prompts"),
        request("/runs"),
        request("/schedules"),
        request("/settings"),
      ]);
      if (!isCurrent()) return;
      setBilling(billingState);
      setWorkspaces(results[0].workspaces);
      setBrands(results[1].brands);
      setPrompts(results[2].prompts);
      setRuns(results[3].runs);
      setNextRunCursor(results[3].next_before_id
        ? { before: results[3].next_before, beforeId: results[3].next_before_id }
        : null);
      setSchedules(results[4].schedules);
      setSettings(results[5]);
      setWorkspace((current) =>
        results[0].workspaces.some((w: Item) => w.id === current)
          ? current
          : results[0].workspaces[0]?.id || "",
      );
      setLoadedOrg(org);
    } catch (e) {
      if (isCurrent()) setError(e instanceof Error ? e.message : "Unable to load workspace");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [org, request]);
  useEffect(() => { setSelectedPromptIds([]); setSelectedScheduleIds([]); setEditingScheduleSelection(false); }, [org,workspace]);
  useEffect(() => {
    setPromptEngineChoices([editPrompt?.engine || "chatgpt"]);
    setPromptLocation(editPrompt?.location_name || "United States");
    setPromptLanguage(editPrompt?.language_code || "en");
    setLocationQuery("");
  }, [editPrompt?.id]);
  useEffect(() => {
    if (!workspaceReady || tab !== "prompts" || !promptEngineChoices.length) return;
    let canceled = false;
    setProviderChoicesLoading(true);
    const timer = window.setTimeout(() => {
      request("/provider/options?engines=" + promptEngineChoices.join(",") + "&q=" + encodeURIComponent(locationQuery) + "&selected_location=" + encodeURIComponent(promptLocation)).then(data => {
        if (canceled) return;
        setProviderChoices(data);
        if (!data.selected_location_supported) setPromptLocation(data.default_location || "");
        if (!data.languages.some((l:Item) => l.code === promptLanguage)) setPromptLanguage(data.default_language || "");
      }).catch(() => { if (!canceled) setProviderChoices({ error: "Supported locations and languages could not load. Retry or refresh before saving." }); }).finally(() => { if (!canceled) setProviderChoicesLoading(false); });
    }, 250);
    return () => { canceled = true; window.clearTimeout(timer); };
  }, [workspaceReady, tab, promptEngineChoices, locationQuery, promptLocation, promptLanguage, request]);
  useEffect(() => {
    if (!orgReady || billing.access_status !== "free_trial" || !billing.free_trial?.ends_at) return;
    const delay = Math.max(0, Number(billing.free_trial.ends_at) - Date.now());
    const timer = window.setTimeout(() => { load(); }, Math.min(delay + 50, 2147483647));
    return () => window.clearTimeout(timer);
  }, [orgReady, billing.access_status, billing.free_trial?.ends_at, load]);
  useEffect(() => {
    setLoadedOrg("");
    setMembers([]);
    setInvites([]);
    setKeys([]);
    setIdeas([]);
    setProviderChoices(null);
    setSelectedPromptIds([]);
    setSelectedScheduleIds([]);
    setEditingScheduleSelection(false);
    setSelectedRun(null);
    setEditPrompt(null);
    setPromptText("");
    setBrand("");
    setNewKey("");
    setInvite("");
    if (org) void load();
    else setLoading(false);
  }, [org, load]);
  useEffect(() => {
    if (!workspaceReady || !["team", "agents"].includes(tab)) return;
    let canceled = false;
    (async () => {
      try {
        if (tab === "team") {
          const d = await request("/members");
          if (!canceled) setMembers(d.members);
          if (isAdmin) {
            const i = await request("/invites");
            if (!canceled) setInvites(i.invites);
          }
        }
        if (tab === "agents" && isAdmin) {
          const d = await request("/keys");
          if (!canceled) setKeys(d.keys);
        }
      } catch (e) {
        if (!canceled)
          setError(e instanceof Error ? e.message : "Unable to load settings");
      }
    })();
    return () => {
      canceled = true;
    };
  }, [tab, workspaceReady, isAdmin, request]);
  useEffect(() => {
    setEditPrompt(null);
    setPromptText("");
    setSelectedRun(null);
  }, [workspace]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  async function submit(
    e: FormEvent<HTMLFormElement>,
    fn: (f: FormData) => Promise<void>,
  ) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    await action(async () => {
      await fn(f);
      form.reset();
    });
  }
  const visiblePrompts = prompts.filter((p) => p.workspace_id === workspace),
    visibleRuns = runs.filter((r) => r.workspace_id === workspace);
  const [engine, setEngine] = useState("all"),
    [brand, setBrand] = useState(""),
    [range, setRange] = useState("30");
  const filteredRuns = visibleRuns.filter(
    (r) =>
      (engine === "all" || r.config?.engine === engine) &&
      r.created_at >= Date.now() - Number(range) * 86400000,
  );
  const successful = filteredRuns.filter(
    (r) => r.status === "succeeded" && r.has_answer,
  );
  const selectedBrand =
    brand || brands.find((b) => b.kind !== "competitor")?.id || "";
  const brandStats: Item[] = brands.map((b) => {
    const sampled = successful.filter((r) =>
      (r.mentions || []).some((m: Item) => m.brand_id === b.id),
    );
    return {
      ...b,
      samples: sampled.length,
      mentions: sampled.filter((r) =>
        r.mentions.some((m: Item) => m.brand_id === b.id && m.mentioned),
      ).length,
      citations: sampled.filter((r) =>
        r.mentions.some((m: Item) => m.brand_id === b.id && m.cited),
      ).length,
    };
  });
  const activeStat = brandStats.find((b) => b.id === selectedBrand),
    percent = (n: number, d: number) =>
      d ? Math.round((n / d) * 100) + "%" : "—";
  const sources = useMemo(() => {
    const pages = new Map<string, Item>(),
      domains = new Map<string, Item>(),
      queries = new Map<string, number>();
    for (const r of successful) {
      const seen = new Set<string>();
      for (const c of r.citations || []) {
        const p = pages.get(c.url) || { ...c, count: 0 };
        p.count++;
        pages.set(c.url, p);
        if (!seen.has(c.domain)) {
          const d = domains.get(c.domain) || { domain: c.domain, count: 0 };
          d.count++;
          domains.set(c.domain, d);
          seen.add(c.domain);
        }
      }
      for (const q of new Set<string>(r.grounding_queries || []))
        queries.set(q, (queries.get(q) || 0) + 1);
    }
    return {
      pages: [...pages.values()].sort((a, b) => b.count - a.count),
      domains: [...domains.values()].sort((a, b) => b.count - a.count),
      queries: [...queries].sort((a, b) => b[1] - a[1]),
    };
  }, [successful.map((r) => r.id).join(",")]);
  const discovered = [
    ...new Set<string>(
      successful.flatMap((r) =>
        (r.discovered_brands || []).map((b: Item) => String(b.name)),
      ),
    ),
  ].filter(
    (n) => !brands.some((b) => b.name.toLowerCase() === n.toLowerCase()),
  );
  async function openRun(id: string) {
    await action(async () => {
      const d = await request("/runs/" + id);
      setSelectedRun(d.run);
      setTab("runs");
    });
  }
  function savePendingRun(batch: PendingRunBatch | null) {
    if (batch) sessionStorage.setItem(batchScope, JSON.stringify(batch));
    else sessionStorage.removeItem(batchScope);
    if (activeOrg.current === org) setPendingBatch(batch ? { scope: batchScope, batch } : null);
  }
  async function submitRunBatch(batch: PendingRunBatch) {
    if (!batchScope || batchInFlight.current) return;
    batchInFlight.current = true;
    try {
      await action(async () => {
        savePendingRun(batch);
        const { prompt_ids, repetitions, batch_key } = batch;
        const result = await request("/runs/bulk", "POST", { prompt_ids, repetitions, batch_key });
        savePendingRun(result.complete ? null : { ...batch, accepted: result.runs.length });
        if (activeOrg.current !== org) return;
        setNotice(`${result.runs.length} of ${result.requested} runs queued. Existing concurrency and spending guardrails apply.`);
        if (result.error) setError(result.error);
        await load();
        if (result.complete && activeOrg.current === org) setTab("runs");
      });
    } finally {
      batchInFlight.current = false;
    }
  }
  async function queuePromptBatch(ids: string[], samples: number) {
    if (!ids.length || !batchScope || batchInFlight.current) return;
    if (ids.length * samples > 100) {
      setError("Select at most 100 runs per batch. Reduce the selection or samples per prompt.");
      return;
    }
    try {
      const saved = sessionStorage.getItem(batchScope);
      if (saved) {
        setPendingBatch({ scope: batchScope, batch: JSON.parse(saved) as PendingRunBatch });
        setError("Resolve the pending batch before starting another.");
        return;
      }
    } catch {
      setError("Enable browser session storage before queueing runs so an interrupted batch can be retried safely.");
      return;
    }
    if (!confirm(`Queue ${ids.length * samples} independent provider runs (${ids.length} saved prompts × ${samples} samples)? Each engine variant and sample consumes its own run and DataForSEO charges.`)) return;
    await submitRunBatch({ prompt_ids: ids, repetitions: samples, batch_key: crypto.randomUUID() });
  }
  async function runPrompt(p: Item) { await queuePromptBatch([p.id],1); }
  async function moreRuns() {
    if (!nextRunCursor) return;
    await action(async () => {
      const query = new URLSearchParams({
        before: String(nextRunCursor.before),
        before_id: nextRunCursor.beforeId,
      });
      const d = await request("/runs?" + query);
      if (activeOrg.current !== org) return;
      setRuns((current) => [...current, ...d.runs]);
      setNextRunCursor(d.next_before_id
        ? { before: d.next_before, beforeId: d.next_before_id }
        : null);
    });
  }
  if (initializing)
    return (
      <main className="app-loading">
        <Loader2 className="animate-spin" size={24} />
        <p>Opening your workspace…</p>
      </main>
    );
  if (pendingInvite && session) return (
    <main className="auth-page">
      <Card className="auth-card"><CardContent>
        <h1>Join {pendingInvite.organization_name}</h1>
        <p>Invited email: <strong>{pendingInvite.recipient_email}</strong></p>
        <p>Signed in as: <strong>{pendingInvite.signed_in_email}</strong></p>
        <p>Role: {pendingInvite.role}. {pendingInvite.already_member ? "You already belong to this organization; your current role will be kept." : "Your existing organizations and data stay separate."}</p>
        {!pendingInvite.email_matches && <p role="alert">Switch accounts to the invited email address before accepting.</p>}
        {pendingInvite.email_matches && !pendingInvite.email_verified && <p role="alert">Verify your email first, then reload this invitation. Sign in again to request a verification email.</p>}
        {error && <p role="alert" className="form-error">{error}</p>}
        <Button disabled={busy || !pendingInvite.email_matches || !pendingInvite.email_verified} onClick={() => action(async () => {
          const accepted = await request("/invites/accept", "POST", { token: pendingInvite.token }, "");
          setOrg(accepted.org_id);
          history.replaceState(null, "", "/app");
          setPendingInvite(null);
          await reloadOrgs();
          setNotice("Invitation accepted. Your team workspace is ready.");
        })}>Accept invitation</Button>
        <Button variant="outline" disabled={busy} onClick={() => action(async () => {
          const r = await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
          if (!r.ok) throw new Error("Unable to sign out. Please try again.");
          location.assign("/login" + (new URLSearchParams(location.search).get("trial") === "start" ? "?trial=start" : "") + location.hash);
        })}>Switch account</Button>
        <Button variant="ghost" disabled={busy} onClick={() => { history.replaceState(null, "", "/app"); setPendingInvite(null); }}>Not now</Button>
      </CardContent></Card>
    </main>
  );
  if (!session)
    return (
      <main className="app-loading">
        <p role="alert">{error || "Please sign in to continue."}</p>
        <Button asChild>
          <Link to="/login">Go to sign in</Link>
        </Button>
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link to="/" className="brand app-brand">
          <span className="brand-mark">
            <svg viewBox="0 0 32 32" fill="none">
              <path
                d="M7 24V17M16 24V11M25 24V5"
                stroke="currentColor"
                strokeWidth="4"
              />
            </svg>
          </span>
          trackrank<span className="brand-suffix">.ai</span>
        </Link>
        <label className="org-switcher">
          <span>ORGANIZATION <HelpTip label="organizations" text="Your team account: members, billing, provider credentials and shared limits live here. An organization can contain multiple workspaces." /></span>
          <select
            value={org}
            disabled={busy}
            onChange={(e) => {
              setOrg(e.target.value);
              setError("");
              setNotice("");
            }}
            aria-label="Organization"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            {!orgs.length && (
              <option value="">Create your first organization</option>
            )}
          </select>
        </label>
        <details className="create-org">
          <summary>
            <Plus size={12} /> New organization
          </summary>
          <form
            onSubmit={(e) =>
              submit(e, async (f) => {
                const d = await request(
                  "/organizations",
                  "POST",
                  { name: f.get("name") },
                  "",
                );
                await reloadOrgs();
                setOrg(d.id);
                setNotice("Organization and default workspace created.");
              })
            }
          >
            <input
              name="name"
              required
              maxLength={100}
              aria-label="New organization name"
              placeholder="Organization name"
            />
            <Button size="sm" disabled={busy}>
              Create
            </Button>
          </form>
        </details>
        <nav className="app-nav" aria-label="Application">
          {nav.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setError("");
              }}
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="app-sidebar-bottom">
          <LegalLinks />
          <Badge variant="outline">Early beta</Badge>
          <span>
            {session.user.name}
            <small>{session.user.email}</small>
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              action(async () => {
                await fetch("/api/auth/sign-out", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: "{}",
                });
                location.assign("/login");
              })
            }
          >
            <LogOut size={14} /> Sign out
          </Button>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div>
            <Building2 size={15} />
            <span>
              {orgs.find((o) => o.id === org)?.name || "Your account"}
            </span>
            <span className="app-slash">/</span>
            <strong>{nav.find((n) => n.id === tab)?.label}</strong>
          </div>
          <div className="topbar-actions">
          <ThemeToggle />
          {org && isAdmin && <Button className="invite-shortcut" size="sm" variant="outline" onClick={() => setTab("team")}><Users size={14} /> Invite teammates</Button>}
          <Button
            className="app-mobile-signout"
            variant="ghost"
            size="sm"
            aria-label="Sign out"
            onClick={() =>
              action(async () => {
                await fetch("/api/auth/sign-out", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: "{}",
                });
                location.assign("/login");
              })
            }
          >
            <LogOut size={14} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setError("");
              void load();
            }}
            disabled={loading || !org}
          >
            {loading ? (
              <Loader2 className="animate-spin" size={13} />
            ) : (
              <RefreshCw size={13} />
            )}{" "}
            Refresh
          </Button>
          </div>
        </header>
        <main className="app-content">
          {orgReady && (billing.enabled || billing.free_trial_enabled) && <Card><CardContent>
            <h2>{billing.access_status === "trial_expired" ? "Your free trial has ended. Choose a plan to continue." : billing.access_status === "free_trial" ? "Your 14-day free trial is active" : "Plan & billing"}</h2>
            {billing.access_status === "free_trial" && <p>Full Starter access until {new Date(billing.free_trial.ends_at).toLocaleString()}. No card is on file for this trial and no automatic charge will happen at expiry.</p>}
            <p>Starter: $10 USD/month before applicable tax. Full product allowances, billed per organization. Your first paid charge is refundable within 7 days. Provider usage is billed separately.</p>
            {billing.access_status === "trial_expired" && <p>Your workspace data is retained. Choose Starter and complete payment to restore access.</p>}
            {billing.status && <p>Subscription: {billing.status}{billing.cancel_at_period_end ? ". Cancels at the end of the current period." : "."}</p>}
            {billing.risk_hold ? <p role="alert">Paid access is paused for billing review. Contact support.</p> : null}
            {billing.owner && billing.trial_eligible && billing.free_trial_enabled && <Button disabled={busy} onClick={() => action(async () => { await request("/billing/trial", "POST"); await load(); })}>Start 14-day free trial</Button>}
            {billing.owner && !["active","trialing"].includes(billing.status) && <Button disabled={busy || !billing.checkout_enabled} onClick={() => { setBusy(true); request("/billing/checkout", "POST").then(r => window.location.assign(r.url)).catch(e => setError(e.message)).finally(() => setBusy(false)); }}>Choose Starter — $10/month</Button>}{" "}
            {billing.owner && billing.has_billing_account && <Button variant="outline" disabled={busy} onClick={() => { setBusy(true); request("/billing/portal", "POST").then(r => window.location.assign(r.url)).catch(e => setError(e.message)).finally(() => setBusy(false)); }}>Manage billing & invoices</Button>}
            {!billing.checkout_enabled && <p>Paid subscriptions are not open yet. Free trials are available; you will not be charged when your trial ends.</p>}
            {!billing.owner && <p>Ask your organization owner to choose a plan or manage billing.</p>}
          </CardContent></Card>}

          <details className="app-structure-guide"><summary>How organizations, workspaces and brands fit together</summary><p><strong>Organization:</strong> your team account, billing, provider credentials and shared limits. <strong>Workspace:</strong> a folder for a client, brand or campaign inside that organization. <strong>Brands:</strong> the businesses you compare in its answers.</p><p>Example: an agency can have one organization, a workspace for each client, and the client plus several competitors as brands inside each workspace. You can also keep multiple related brands in one workspace.</p></details>
          {error && (
            <div className="app-message error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {notice && (
            <div className="app-message success" role="status">
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          {!org ? (
            <Card>
              <CardContent>
                <Empty
                  title="A home for your team's visibility."
                  description="Create an organization to keep your brands, credentials, workspaces, and API access together. No onboarding wizard required."
                />
                <form
                  className="app-inline-form"
                  onSubmit={(e) =>
                    submit(e, async (f) => {
                      const d = await request(
                        "/organizations",
                        "POST",
                        { name: f.get("name") },
                        "",
                      );
                      await reloadOrgs();
                      setOrg(d.id);
                    })
                  }
                >
                  <input
                    name="name"
                    placeholder="Organization name"
                    required
                    maxLength={100}
                    aria-label="Organization name"
                  />
                  <Button disabled={busy}>
                    <Plus size={15} /> Create organization
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : !orgReady ? (
            <Card><CardContent>
              {error ? <p>Use Refresh to try loading this organization again.</p> : <p role="status">Loading organization…</p>}
            </CardContent></Card>
          ) : billingBlocksWorkspace(billing.access_status) ? (
            <Card><CardContent><h2>Choose your plan</h2><p>Starter includes 6,000 tracking runs and 200,000 API operations per calendar month, 3 concurrent runs, and team/API access. Complete payment above to continue. Existing data stays in your organization.</p></CardContent></Card>
          ) : (
            <>
              <div className="app-page-heading">
                <div>
                  <p className="section-eyebrow">
                    {tab === "overview"
                      ? "YOUR BRAND, IN CONTEXT"
                      : "TRACKRANK WORKSPACE"}
                  </p>
                  <h1>
                    {tab === "overview"
                      ? "Your next move, clearer."
                      : nav.find((n) => n.id === tab)?.label + "."}
                  </h1>
                  <p>
                    {tab === "overview"
                      ? "Real collected results. No sample data."
                      : "Organization-scoped research and collaboration."}
                  </p>
                </div>
                {[
                  "overview",
                  "prompts",
                  "runs",
                  "research",
                  "brands",
                  "schedules",
                ].includes(tab) && (
                  <div className="workspace-control">
                    <label>
                      Workspace <HelpTip label="workspaces" text="A research folder inside your organization. Use one per client, brand or campaign. Each workspace can compare multiple brands and competitors; billing and credentials stay shared by the organization." />
                      <select
                        value={workspace}
                        onChange={(e) => setWorkspace(e.target.value)}
                      >
                        {workspaces.map((w) => (
                          <option value={w.id} key={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {canWrite && (
                      <details>
                        <summary>
                          <Plus size={14} /> New
                        </summary>
                        <form
                          className="popover-form"
                          onSubmit={(e) =>
                            submit(e, async (f) => {
                              const d = await request("/workspaces", "POST", {
                                name: f.get("name"),
                                brand_id: f.get("brand_id") || null,
                              });
                              await load();
                              setWorkspace(d.id);
                            })
                          }
                        >
                          <input
                            required
                            name="name"
                            maxLength={100}
                            placeholder="Workspace name"
                            aria-label="Workspace name"
                          />
                          <select name="brand_id" aria-label="Primary brand">
                            <option value="">Sandbox / no primary brand</option>
                            {brands.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                          <Button size="sm" disabled={busy}>
                            Create workspace
                          </Button>
                        </form>
                      </details>
                    )}
                  </div>
                )}
              </div>
              {["overview", "research"].includes(tab) && (
                <div className="app-filters">
                  <label>
                    Engine
                    <select
                      value={engine}
                      onChange={(e) => setEngine(e.target.value)}
                    >
                      <option value="all">All engines</option>
                      {Object.entries(engines).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tracked brand
                    <select
                      value={selectedBrand}
                      onChange={(e) => setBrand(e.target.value)}
                    >
                      <option value="">No tracked brand</option>
                      {brands.map((b) => (
                        <option value={b.id} key={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Time range
                    <select
                      value={range}
                      onChange={(e) => setRange(e.target.value)}
                    >
                      <option value="7">Last 7 days</option>
                      <option value="30">Last 30 days</option>
                      <option value="90">Last 90 days</option>
                    </select>
                  </label>
                  <span>
                    Based on {filteredRuns.length} loaded runs ·{" "}
                    {successful.length} successful AI answers
                  </span>
                </div>
              )}
              {tab === "overview" && (
                <>
                  <div className="app-metrics">
                    {[
                      {
                        label: "Brand mention rate",
                        value: percent(
                          activeStat?.mentions || 0,
                          activeStat?.samples || 0,
                        ),
                        note: `${activeStat?.mentions || 0} / ${activeStat?.samples || 0} eligible answers`,
                      },
                      {
                        label: "Website citation rate",
                        value: percent(
                          activeStat?.citations || 0,
                          activeStat?.samples || 0,
                        ),
                        note: `${activeStat?.citations || 0} / ${activeStat?.samples || 0} eligible answers`,
                      },
                      {
                        label: "Tracked prompts",
                        value: String(visiblePrompts.length),
                        note: `${visiblePrompts.filter((p) => p.enabled).length} enabled in this workspace`,
                      },
                      {
                        label: "Collected answers",
                        value: String(successful.length),
                        note: "Failures and absent AI Overviews excluded",
                      },
                    ].map((m) => (
                      <Card className="app-stat" key={m.label}>
                        <CardContent>
                          <span>{m.label}</span>
                          <strong>{m.value}</strong>
                          <small>{m.note}</small>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  <Card className="app-panel">
                    <CardContent>
                      <div className="panel-title">
                        <div>
                          <h2>Visibility over time</h2>
                          <p>
                            Daily mention rate, based only on answers containing
                            the tracked brand snapshot.
                          </p>
                        </div>
                        <Badge variant="outline">
                          {engine === "all" ? "All engines" : engines[engine]}
                        </Badge>
                      </div>
                      <HistoryChart runs={successful} brandId={selectedBrand} />
                    </CardContent>
                  </Card>
                  <div className="app-two-col">
                    <Card>
                      <CardContent>
                        <div className="panel-title">
                          <h2>Brand comparison</h2>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setTab("brands")}
                          >
                            Manage <ArrowUpRight size={13} />
                          </Button>
                        </div>
                        {brands.length ? (
                          <div className="comparison-list">
                            {brandStats.map((b) => (
                              <div key={b.id}>
                                <span>
                                  <strong>{b.name}</strong>
                                  <small>
                                    {b.kind} · {b.samples} answers
                                  </small>
                                </span>
                                <div className="brand-bar">
                                  <i
                                    style={{
                                      width:
                                        percent(b.mentions, b.samples) === "—"
                                          ? "0%"
                                          : percent(b.mentions, b.samples),
                                    }}
                                  />
                                </div>
                                <b>{percent(b.mentions, b.samples)}</b>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <Empty
                            title="Add your first brand"
                            description="Track your brand, agency clients, and competitors. Metrics only begin when that brand is included in new runs."
                          >
                            <Button onClick={() => setTab("brands")} size="sm">
                              Add brand
                            </Button>
                          </Empty>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent>
                        <div className="panel-title">
                          <h2>Most-cited domains</h2>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setTab("research")}
                          >
                            Explore <ArrowUpRight size={13} />
                          </Button>
                        </div>
                        {sources.domains.length ? (
                          sources.domains.slice(0, 6).map((d) => (
                            <div className="simple-row" key={d.domain}>
                              <span>{d.domain}</span>
                              <Badge variant="secondary">
                                {d.count} answers
                              </Badge>
                            </div>
                          ))
                        ) : (
                          <Empty
                            title="Follow the sources"
                            description="Cited domains will appear after your first successful collection."
                          />
                        )}
                      </CardContent>
                    </Card>
                  </div>
                  <p className="data-note">
                    Mention matching uses case-insensitive whole-name/alias
                    matches. Citation matching uses the canonical brand domain
                    and its subdomains. Google organic results are not counted
                    as AI citations.
                  </p>
                </>
              )}
              {tab === "prompts" && (
                <>
                  {pendingRun && canWrite && (
                    <Card>
                      <CardContent>
                        <h2>Pending run batch</h2>
                        <p>
                          {pendingRun.accepted === undefined
                            ? "The batch has no confirmed result. Retry to check its status and queue only missing runs."
                            : `${pendingRun.accepted} of ${pendingRun.prompt_ids.length * pendingRun.repetitions} runs queued. Retry with the original key to resume the batch.`}
                        </p>
                        <div className="form-actions">
                          <Button disabled={busy} onClick={() => submitRunBatch(pendingRun)}>
                            Retry pending batch
                          </Button>
                          <Button variant="outline" disabled={busy} onClick={() => {
                            if (confirm("Discard this retry? Previously queued runs will continue, and queueing a new batch may incur additional provider charges.")) {
                              void action(async () => savePendingRun(null));
                            }
                          }}>
                            Discard retry
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  <Card>
                    <CardContent>
                      <div className="panel-title">
                        <h2>
                          {editPrompt ? "Edit prompt" : "Add a research prompt"}
                        </h2>
                        <Badge variant="secondary">
                          Scraper collection only
                        </Badge>
                      </div>
                      {canWrite ? (
                        <form
                          className="form-stack"
                          onSubmit={(e) =>
                            submit(e, async (f) => {
                              const texts = editPrompt ? [promptText.trim()] : parsePromptInput(promptText, promptSeparator);
                              const selected = f.getAll("engines").map(String);
                              const ordered = editPrompt && selected.includes(editPrompt.engine) ? [editPrompt.engine, ...selected.filter(e => e !== editPrompt.engine)] : selected;
                              if (!texts.length || !ordered.length) throw new Error("Enter prompts and select at least one engine.");
                              if (texts.length * ordered.length > 100) throw new Error("Save at most 100 prompt/engine combinations per batch.");
                              const result = await request("/prompts/bulk", "POST", {
                                workspace_id: workspace, brand_id: f.get("brand_id") || null,
                                texts, engines: ordered, ...(editPrompt ? { source_id: editPrompt.id } : {}),
                                mode: f.get("mode"), location_name: f.get("location_name"), language_code: f.get("language_code"), enabled: f.get("enabled") === "on",
                              });
                              setPromptText("");
                              setEditPrompt(null);
                              setNotice(
                                `${result.saved_combinations} prompt/engine combinations saved (existing matches reused). No provider requests were made.`,
                              );
                              await load();
                            })
                          }
                          key={editPrompt?.id || "new"}
                        >
                          <FormField label={editPrompt ? "Prompt" : "Prompts — paste your list"} hint={editPrompt ? "Edit this prompt. Select extra engines below to add variants without deleting other saved prompts." : "Paste one prompt per line or separate prompts with commas. Auto uses lines when present, preserving commas inside each line. For a single prompt containing commas, choose One per line."}>
                            <textarea
                              name="text"
                              required
                              minLength={3}
                              maxLength={editPrompt ? 700 : 30000}
                              value={promptText}
                              onChange={(e) => setPromptText(e.target.value)}
                              placeholder="Who are the best house cleaning services in Seattle?"
                              rows={3}
                            />
                          </FormField>
                          <div className="form-grid">
                            <fieldset className="form-stack"><legend>Engines <HelpTip label="engines" text="Select one or more engines. Each prompt/engine pair is saved separately and consumes its own run when executed. Saving never runs a collection." /></legend>
                              {Object.entries(engines).map(([value,label]) => <label className="check-field" key={value}><input type="checkbox" name="engines" value={value} checked={promptEngineChoices.includes(value)} onChange={e => setPromptEngineChoices(current => e.target.checked ? [...current,value] : current.filter(x => x !== value))} /> {label}</label>)}
                            </fieldset>
                            {!editPrompt && <FormField label="Paste format"><select value={promptSeparator} onChange={e => setPromptSeparator(e.target.value)}><option value="auto">Auto — lines first, otherwise commas</option><option value="lines">One per line — keep commas in prompts</option><option value="commas">Comma-separated — quote prompts containing commas</option></select></FormField>}
                            <details className="advanced-settings"><summary>Advanced settings · location, language & execution</summary><div className="form-grid">
                            <FormField
                              label="Queue / execution"
                              hint="Priority and live can cost more. Standard is the default."
                            >
                              <select
                                name="mode"
                                defaultValue={editPrompt?.mode || "standard"}
                              >
                                <option value="standard">Standard queue</option>
                                <option value="priority">Priority queue</option>
                                <option value="live">Live</option>
                              </select>
                            </FormField>
                            <FormField label="Location" hint="Search DataForSEO's supported locations, then choose a match. With several engines checked, only shared locations are offered. Search a city when using Google or Gemini.">
                              <input type="search" aria-label="Search supported locations" placeholder="Search country or city…" value={locationQuery} onChange={e => setLocationQuery(e.target.value)} maxLength={100} />
                              <select aria-label="Selected location" name="location_name" required value={promptLocation} disabled={providerChoicesLoading || !!providerChoices?.error} onChange={e => setPromptLocation(e.target.value)}>
                                {(providerChoices?.locations || [promptLocation]).filter(Boolean).map((name:string) => <option key={name} value={name}>{name}</option>)}
                              </select>
                              <small>{providerChoicesLoading ? "Loading supported choices…" : providerChoices?.error || "Select a listed value. Narrow the search for more locations."}</small>
                            </FormField>
                            <FormField label="Language" hint="Languages supported by every selected engine. Provider codes are shown next to the names; arbitrary codes are rejected.">
                              <select aria-label="Language" name="language_code" required value={promptLanguage} disabled={providerChoicesLoading || !!providerChoices?.error} onChange={e => setPromptLanguage(e.target.value)}>
                                {(providerChoices?.languages || [{code:"en",name:"English"}]).map((language:Item) => <option key={language.code} value={language.code}>{language.name} ({language.code})</option>)}
                              </select>
                            </FormField>
                            <FormField label="Associated brand (optional)">
                              <select
                                name="brand_id"
                                defaultValue={editPrompt?.brand_id || ""}
                              >
                                <option value="">
                                  Workspace research / all tracked brands
                                </option>
                                {brands.map((b) => (
                                  <option value={b.id} key={b.id}>
                                    {b.name}
                                  </option>
                                ))}
                              </select>
                            </FormField>
                            </div></details>
                            <label className="check-field">
                              <input
                                type="checkbox"
                                name="enabled"
                                defaultChecked={
                                  editPrompt ? !!editPrompt.enabled : true
                                }
                              />{" "}
                              Allow manual & scheduled runs <HelpTip label="allow runs" text="When checked, this prompt can be run manually or by an enabled schedule. Unchecking pauses future runs without deleting the prompt or its history. This does not start a run or create a schedule." />
                            </label>
                          </div>
                          <div className="form-actions">
                            <Button disabled={busy || providerChoicesLoading || !providerChoices || !!providerChoices.error || !promptEngineChoices.length}>
                              <Plus size={14} />
                              {editPrompt ? "Save prompt settings" : "Save prompts for selected engines"}
                            </Button>
                            {editPrompt && (
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  setEditPrompt(null);
                                  setPromptText("");
                                }}
                              >
                                Cancel editing
                              </Button>
                            )}
                          </div>
                        </form>
                      ) : (
                        <p className="data-note">Viewer access is read-only.</p>
                      )}
                    </CardContent>
                  </Card>
                  <details className="ideas-panel">
                    <summary>
                      <Sparkles size={15} /> Need prompt ideas? Generate free
                      research templates.
                    </summary>
                    <form
                      className="app-inline-form"
                      onSubmit={(e) =>
                        submit(e, async (f) => {
                          const d = await request("/prompt-ideas", "POST", {
                            topic: f.get("topic"),
                            location: f.get("location") || "",
                          });
                          setIdeas(d.prompts);
                        })
                      }
                    >
                      <input
                        name="topic"
                        required
                        minLength={2}
                        maxLength={150}
                        placeholder="Topic, e.g. cleaning services"
                        aria-label="Research topic"
                      />
                      <input
                        name="location"
                        maxLength={100}
                        placeholder="Location (optional)"
                        aria-label="Research location"
                      />
                      <Button size="sm" disabled={busy || !canWrite}>
                        Generate ideas
                      </Button>
                    </form>
                    <p className="data-note">
                      Deterministic templates, not AI-generated or researched
                      demand data.
                    </p>
                    {ideas.map((i) => (
                      <button
                        key={i}
                        className="idea-option"
                        onClick={() => {
                          setPromptText(i);
                          setEditPrompt(null);
                        }}
                      >
                        {i}
                        <Plus size={13} />
                      </button>
                    ))}
                  </details>
                  <Card>
                    <CardContent>
                      <div className="panel-title">
                        <h2>{visiblePrompts.length} saved prompts</h2>
                      </div>
                      {visiblePrompts.length>0 && canWrite && <div className="bulk-toolbar">
                        <label className="check-field"><input type="checkbox" aria-label="Select all saved prompts in this workspace" checked={selectedPromptIds.length>0 && visiblePrompts.every(p=>selectedPromptIds.includes(p.id))} onChange={e=>setSelectedPromptIds(e.target.checked?visiblePrompts.map(p=>p.id):[])} /> Select all shown ({visiblePrompts.length})</label><span>{selectedPromptIds.length} selected</span>
                        <Button disabled={busy||!!pendingRun||!selectedPromptIds.length} onClick={()=>queuePromptBatch(selectedPromptIds,runSamples)}>Run selected — {selectedPromptIds.length*runSamples} runs</Button>
                        <Button variant="outline" disabled={!selectedPromptIds.length} onClick={()=>{setEditingScheduleSelection(false);setTab("schedules");}}>Schedule selected</Button>
                        <Button variant="outline" disabled={busy||!selectedPromptIds.length} onClick={()=>action(async()=>{await request("/prompts/bulk-settings","PATCH",{ids:selectedPromptIds,enabled:true});await load();setNotice("Selected prompts enabled.");})}>Enable selected</Button>
                        <Button variant="outline" disabled={busy||!selectedPromptIds.length} onClick={()=>action(async()=>{await request("/prompts/bulk-settings","PATCH",{ids:selectedPromptIds,enabled:false});await load();setNotice("Selected prompts paused; history retained.");})}>Pause selected</Button>
                        <details><summary>Advanced · sampling & bulk settings</summary><form className="app-inline-form" onSubmit={e=>submit(e,async f=>{await request("/prompts/bulk-settings","PATCH",{ids:selectedPromptIds,mode:f.get("bulk_mode")});await load();setNotice("Execution mode updated for selected prompts. No provider request was made.");})}><FormField label="Execution mode for selected prompts" hint="Priority and live may cost more on future runs. This only changes saved settings."><select name="bulk_mode"><option value="standard">Standard queue</option><option value="priority">Priority queue</option><option value="live">Live</option></select></FormField><Button disabled={busy||!selectedPromptIds.length}>Apply mode to selected</Button></form><FormField label="Samples per prompt" hint="Independent back-to-back samples, queued under the normal concurrency limit. Each sample is a separate provider charge and run."><input type="number" min={1} max={10} value={runSamples} onChange={e=>setRunSamples(Math.max(1,Math.min(10,Number(e.target.value)||1)))} /></FormField></details>
                      </div>}
                      {visiblePrompts.length ? (
                        <div className="prompt-table">
                          {visiblePrompts.map((p) => (
                            <div className="saved-prompt" key={p.id}>
                              {canWrite && <input type="checkbox" aria-label={`Select ${p.text} — ${engines[p.engine]}`} checked={selectedPromptIds.includes(p.id)} onChange={e=>setSelectedPromptIds(current=>e.target.checked?[...current,p.id]:current.filter(id=>id!==p.id))} />}
                              <div>
                                <strong>{p.text}</strong>
                                <small>
                                  {engines[p.engine]} · {p.location_name} ·{" "}
                                  {p.language_code} · {p.mode}{" "}
                                  {!p.enabled && "· paused"}
                                </small>
                                <code>{p.id}</code>
                              </div>
                              <div>
                                {canWrite && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setEditPrompt(p);
                                        setPromptText(p.text);
                                        window.scrollTo({
                                          top: 0,
                                          behavior: "smooth",
                                        });
                                      }}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      size="sm"
                                      disabled={
                                        busy ||
                                        !!pendingRun ||
                                        !p.enabled ||
                                        !settings.dataforseo_configured
                                      }
                                      onClick={() => runPrompt(p)}
                                    >
                                      <Play size={12} /> Run
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty
                          title="Ask a better question."
                          description="Save a prompt above. It won't incur charges until you run it or enable a schedule."
                        />
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
              {tab === "research" && (
                <>
                  <Card>
                    <CardContent>
                      <div className="panel-title">
                        <div>
                          <h2>The evidence behind the answers</h2>
                          <p>
                            Only collected sources. Organic SERPs remain
                            separate in each run.
                          </p>
                        </div>
                      </div>
                      <Tabs defaultValue="domains">
                        <TabsList>
                          <TabsTrigger value="domains">Domains</TabsTrigger>
                          <TabsTrigger value="pages">Pages</TabsTrigger>
                          <TabsTrigger value="queries">
                            Grounding queries
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="domains">
                          {sources.domains.length ? (
                            sources.domains.map((d) => (
                              <div className="simple-row" key={d.domain}>
                                <strong>{d.domain}</strong>
                                <span>
                                  {d.count} / {successful.length} answers ·{" "}
                                  {percent(d.count, successful.length)}
                                </span>
                              </div>
                            ))
                          ) : (
                            <Empty
                              title="No cited domains yet"
                              description="Run a prompt, then return here once the result has been collected."
                            />
                          )}
                        </TabsContent>
                        <TabsContent value="pages">
                          {sources.pages.length ? (
                            sources.pages.map((p) => (
                              <div className="citation-row" key={p.url}>
                                <a
                                  href={p.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <strong>{p.title}</strong>
                                  <span>{p.url}</span>
                                </a>
                                <Badge variant="secondary">
                                  {p.count} answers
                                </Badge>
                              </div>
                            ))
                          ) : (
                            <Empty
                              title="No cited pages yet"
                              description="This view lists actual cited pages, not all URLs appearing in a SERP."
                            />
                          )}
                        </TabsContent>
                        <TabsContent value="queries">
                          {sources.queries.length ? (
                            sources.queries.map(([q, count]) => (
                              <div className="simple-row" key={q}>
                                <span>{q}</span>
                                <Badge variant="secondary">
                                  {count} answers
                                </Badge>
                              </div>
                            ))
                          ) : (
                            <Empty
                              title="No grounding queries returned"
                              description="Grounding queries appear only when the provider includes them; missing queries are not inferred."
                            />
                          )}
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <div className="panel-title">
                        <div>
                          <h2>Discovered brands</h2>
                          <p>
                            Provider-detected entities from your collected
                            answers. Review before tracking.
                          </p>
                        </div>
                      </div>
                      {discovered.length ? (
                        discovered.map((n) => (
                          <div className="simple-row" key={n}>
                            <span>{n}</span>
                            {canWrite && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  action(async () => {
                                    await request("/brands", "POST", {
                                      name: n,
                                      kind: "competitor",
                                    });
                                    setNotice(
                                      "Competitor added. It will be included in future run snapshots.",
                                    );
                                    await load();
                                  })
                                }
                              >
                                <Plus size={13} /> Track competitor
                              </Button>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="data-note">
                          No untracked entities found in the loaded results.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
              {tab === "runs" && (
                <>
                  {selectedRun && (
                    <Card className="selected-run">
                      <CardContent>
                        <div className="panel-title">
                          <div>
                            <Status value={selectedRun.status} />
                            <h2>{selectedRun.prompt_text}</h2>
                            <p>
                              {engines[selectedRun.config?.engine]} ·{" "}
                              {selectedRun.config?.location_name} ·{" "}
                              {date(selectedRun.created_at)}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedRun(null)}
                          >
                            Close
                          </Button>
                        </div>
                        {selectedRun.error && (
                          <p className="form-error">{selectedRun.error}</p>
                        )}
                        <div className="run-actions">
                          {selectedRun.status === "submitted" && canWrite && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                action(async () => {
                                  const d = await request(
                                    "/runs/" + selectedRun.id + "/refresh",
                                    "POST",
                                    {},
                                  );
                                  setSelectedRun(d.run);
                                  await load();
                                })
                              }
                            >
                              <RefreshCw size={13} /> Check provider result
                            </Button>
                          )}
                          {selectedRun.status === "succeeded" && (
                            <>
                              <a
                                className="small-link"
                                href={
                                  "/api/v1/runs/" +
                                  selectedRun.id +
                                  "/raw?org=" +
                                  org
                                }
                              >
                                <Download size={13} /> Raw JSON
                              </a>
                              {canWrite && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={
                                    busy || !settings.openrouter_configured
                                  }
                                  onClick={() => {
                                    if (
                                      confirm(
                                        "Analyze this result using your OpenRouter account? Inference charges apply.",
                                      )
                                    )
                                      action(async () => {
                                        const d = await request(
                                          "/runs/" +
                                            selectedRun.id +
                                            "/analyze",
                                          "POST",
                                          {},
                                        );
                                        setSelectedRun((r: Item | null) => ({
                                          ...r,
                                          analysis: d.analysis,
                                        }));
                                      });
                                  }}
                                >
                                  <Sparkles size={13} /> Analyze with OpenRouter
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                        <Tabs defaultValue="answer">
                          <TabsList>
                            <TabsTrigger value="answer">Answer</TabsTrigger>
                            <TabsTrigger value="citations">
                              Citations
                            </TabsTrigger>
                            <TabsTrigger value="queries">Queries</TabsTrigger>
                            <TabsTrigger value="organic">SERP</TabsTrigger>
                            <TabsTrigger value="analysis">Analysis</TabsTrigger>
                          </TabsList>
                          <TabsContent value="answer">
                            <pre className="answer-content">
                              {selectedRun.answer_text ||
                                (selectedRun.status === "succeeded"
                                  ? "No AI answer / AI Overview was present in this collection."
                                  : "Waiting for a result.")}
                            </pre>
                            <div className="mention-tags">
                              {(selectedRun.mentions || []).map((m: Item) => (
                                <Badge
                                  variant={
                                    m.mentioned ? "secondary" : "outline"
                                  }
                                  key={m.brand_id}
                                >
                                  {m.name}:{" "}
                                  {m.mentioned ? "mentioned" : "not mentioned"}
                                  {m.cited ? " · cited" : ""}
                                </Badge>
                              ))}
                            </div>
                          </TabsContent>
                          <TabsContent value="citations">
                            {(selectedRun.citations || []).map((c: Item) => (
                              <div className="citation-row" key={c.url}>
                                <a
                                  target="_blank"
                                  rel="noreferrer"
                                  href={c.url}
                                >
                                  <strong>{c.title}</strong>
                                  <span>{c.url}</span>
                                </a>
                                <ExternalLink size={13} />
                              </div>
                            ))}
                            {!selectedRun.citations?.length && (
                              <p className="data-note">
                                The provider returned no citations.
                              </p>
                            )}
                          </TabsContent>
                          <TabsContent value="queries">
                            <ul className="query-list">
                              {(selectedRun.grounding_queries || []).map(
                                (q: string) => (
                                  <li key={q}>{q}</li>
                                ),
                              )}
                            </ul>
                            {!selectedRun.grounding_queries?.length && (
                              <p className="data-note">
                                No grounding queries were returned.
                              </p>
                            )}
                          </TabsContent>
                          <TabsContent value="organic">
                            {(selectedRun.organic_results || []).map(
                              (s: Item, i: number) => (
                                <div className="citation-row" key={i}>
                                  <Badge variant="outline">#{s.rank}</Badge>
                                  <a
                                    href={s.url || undefined}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <strong>{s.title}</strong>
                                    <span>
                                      {s.domain} · {s.description}
                                    </span>
                                  </a>
                                </div>
                              ),
                            )}
                            {!selectedRun.organic_results?.length && (
                              <p className="data-note">
                                Organic results are available for Google
                                collections only.
                              </p>
                            )}
                          </TabsContent>
                          <TabsContent value="analysis">
                            <pre className="answer-content">
                              {selectedRun.analysis ||
                                "No analysis yet. Add an OpenRouter key and model in Settings, then choose Analyze. Recommendations are hypotheses based on this collected evidence, not verified ranking causes."}
                            </pre>
                          </TabsContent>
                        </Tabs>
                      </CardContent>
                    </Card>
                  )}
                  <Card>
                    <CardContent>
                      <div className="panel-title">
                        <h2>Collection history</h2>
                        <a
                          className="small-link"
                          href={"/api/v1/export?org=" + org}
                        >
                          <Download size={14} /> CSV export
                        </a>
                      </div>
                      {visibleRuns.length ? (
                        visibleRuns.map((r) => (
                          <button
                            className="run-row"
                            key={r.id}
                            onClick={() => openRun(r.id)}
                          >
                            <span>
                              <strong>{r.prompt_text}</strong>
                              <small>
                                {engines[r.config?.engine]} ·{" "}
                                {date(r.created_at)} · {r.config?.mode}
                              </small>
                            </span>
                            <Status value={r.status} />
                            <ArrowUpRight size={15} />
                          </button>
                        ))
                      ) : (
                        <Empty
                          title="Your history starts with a question."
                          description="Add a prompt and run it to collect your first answer."
                        >
                          <Button size="sm" onClick={() => setTab("prompts")}>
                            Manage prompts
                          </Button>
                        </Empty>
                      )}
                      <p className="data-note">
                        Standard/priority runs finish asynchronously. Refresh
                        this page to retrieve updated status. Provider-reported
                        cost can lag or differ from final billing.
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}
              {tab === "brands" && (
                <>
                  <Card>
                    <CardContent>
                      <div className="panel-title">
                        <h2>Add a brand</h2>
                      </div>
                      {canWrite ? (
                        <form
                          className="form-stack"
                          onSubmit={(e) =>
                            submit(e, async (f) => {
                              await request("/brands", "POST", {
                                name: f.get("name"),
                                domain: f.get("domain") || "",
                                kind: f.get("kind"),
                                aliases: String(f.get("aliases") || "")
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              });
                              setNotice(
                                "Brand added. Future runs will match it; past snapshots stay unchanged.",
                              );
                              await load();
                            })
                          }
                        >
                          <div className="form-grid">
                            <FormField label="Brand name">
                              <input
                                required
                                name="name"
                                maxLength={100}
                                placeholder="Puget Sound Cleaners"
                              />
                            </FormField>
                            <FormField label="Canonical domain (optional)">
                              <input
                                name="domain"
                                placeholder="pugetsoundcleaners.com"
                                maxLength={253}
                              />
                            </FormField>
                            <FormField label="Relationship">
                              <select name="kind">
                                <option value="own">Our brand</option>
                                <option value="client">Agency client</option>
                                <option value="competitor">Competitor</option>
                              </select>
                            </FormField>
                            <FormField
                              label="Aliases (comma separated)"
                              hint="Use distinctive aliases, not generic words."
                            >
                              <input
                                name="aliases"
                                maxLength={1500}
                                placeholder="PSC, Puget Sound Cleaning"
                              />
                            </FormField>
                          </div>
                          <Button disabled={busy}>
                            <Plus size={14} /> Add brand
                          </Button>
                        </form>
                      ) : (
                        <p className="data-note">Viewer access is read-only.</p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <h2>Workspace brand set <HelpTip label="brands" text="Brands are the businesses you want to measure in answers: your company, clients and competitors. A workspace can track several brands together for comparison." /></h2>
                      <p className="data-note">
                        Choose which brands and competitors belong in this
                        workspace. With no selections, it acts as a sandbox and
                        tracks all organization brands. Relationship overrides
                        apply only to this workspace.
                      </p>
                      {canWrite && (
                        <form
                          className="app-inline-form"
                          onSubmit={(e) =>
                            submit(e, async (f) => {
                              await request(
                                "/workspaces/" + workspace + "/brands",
                                "POST",
                                {
                                  brand_id: f.get("brand_id"),
                                  kind: f.get("kind"),
                                },
                              );
                              setNotice(
                                "Workspace brand set updated for future runs.",
                              );
                              await load();
                            })
                          }
                        >
                          <select
                            name="brand_id"
                            required
                            aria-label="Brand to track in workspace"
                          >
                            <option value="">Select brand</option>
                            {brands.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                          <select
                            name="kind"
                            aria-label="Workspace brand relationship"
                          >
                            <option value="own">Our brand</option>
                            <option value="client">Client</option>
                            <option value="competitor">Competitor</option>
                          </select>
                          <Button
                            disabled={busy || !brands.length || !workspace}
                            size="sm"
                          >
                            Track in workspace
                          </Button>
                        </form>
                      )}
                      {JSON.parse(
                        workspaces.find((w) => w.id === workspace)?.brand_ids ||
                          "[]",
                      ).map((bid: string) => (
                        <div className="simple-row" key={bid}>
                          <span>
                            {brands.find((b) => b.id === bid)?.name || bid}
                          </span>
                          {canWrite && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                action(async () => {
                                  await request(
                                    "/workspaces/" +
                                      workspace +
                                      "/brands/" +
                                      bid,
                                    "DELETE",
                                  );
                                  await load();
                                })
                              }
                            >
                              Unlink
                            </Button>
                          )}
                        </div>
                      ))}
                      <h2 style={{ marginTop: 25 }}>Organization brands</h2>
                      {brands.length ? (
                        brands.map((b) => (
                          <div className="simple-row" key={b.id}>
                            <span>
                              <strong>{b.name}</strong>
                              <small>
                                {b.domain || "No domain configured"} ·{" "}
                                {JSON.parse(b.aliases || "[]").join(", ") ||
                                  "No aliases"}
                              </small>
                              <code>{b.id}</code>
                            </span>
                            <Badge variant="outline">{b.kind}</Badge>
                          </div>
                        ))
                      ) : (
                        <Empty
                          title="One home for every brand."
                          description="Your own company, client brands, and competitors can live in the same organization."
                        />
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
              {tab === "schedules" && (
                <>
                  <Card>
                    <CardContent>
                      <div className="panel-title">
                        <h2>{editingScheduleSelection ? `Edit ${selectedScheduleIds.length} selected schedules` : "Schedule a batch of prompts"}</h2>
                        <Badge variant="outline">Batch scheduling</Badge>
                      </div>
                      {canWrite ? (
                        <form className="form-stack" onSubmit={e=>submit(e,async f=>{
                          const data={preset:scheduleFrequency,days:scheduleDays,times:scheduleTimes,timezone:scheduleTimezone,repetitions:scheduleSamples};
                          if(editingScheduleSelection){await request("/schedules/bulk","PATCH",{ids:selectedScheduleIds,...data});setNotice("Selected schedules updated. Timing edits apply to future slots, not past times.");setEditingScheduleSelection(false);}
                          else {const result=await request("/schedules/bulk","POST",{prompt_ids:selectedPromptIds,name:f.get("batch_name")||"Scheduled prompts",...data,enabled:false});setNotice(`Paused batch created: ${result.prompts} prompts, ${result.runs_per_time} runs per time slot, ${result.runs_per_scheduled_day} runs per scheduled day. Enable selected schedules when ready.`);}
                          await load();
                        })}>
                          {!editingScheduleSelection && <><PromptBatchPicker prompts={visiblePrompts} selected={selectedPromptIds} onChange={setSelectedPromptIds} /><FormField label="Batch name (optional)"><input name="batch_name" maxLength={100} placeholder="Daily brand checks" /></FormField></>}
                          <div className="form-grid">
                            <FormField label="Frequency"><select value={scheduleFrequency} onChange={e=>setScheduleFrequency(e.target.value)}><option value="daily">Every day</option><option value="weekly">Once a week</option><option value="mwf">Monday, Wednesday, Friday</option><option value="custom">Custom weekdays</option></select></FormField>
                            <FormField label="Local time"><input type="time" required value={scheduleTimes[0]} onChange={e=>setScheduleTimes(current=>[e.target.value,...current.slice(1)])} /></FormField>
                            <FormField label="Timezone"><select value={scheduleTimezone} onChange={e=>setScheduleTimezone(e.target.value)}>{[...new Set([scheduleTimezone,"UTC",...Intl.supportedValuesOf("timeZone")])].sort().map(tz=><option key={tz} value={tz}>{tz}</option>)}</select></FormField>
                          </div>
                          {["weekly","custom"].includes(scheduleFrequency) && <fieldset><legend>Weekdays</legend>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day,index)=><label className="check-field" key={day}><input type="checkbox" checked={scheduleDays.includes(index)} onChange={e=>setScheduleDays(current=>scheduleFrequency==='weekly'?[index]:e.target.checked?[...current,index]:current.filter(d=>d!==index))} />{day}</label>)}</fieldset>}
                          <details className="advanced-settings"><summary>Advanced · repeated samples & extra daily times</summary>
                            <FormField label="Samples per prompt per time slot" hint="For example: 4 saved prompts × 5 samples = 20 independent provider runs each time. Back-to-back means queued consecutively, not bypassing concurrency or spending limits."><input type="number" min={1} max={10} value={scheduleSamples} onChange={e=>setScheduleSamples(Math.max(1,Math.min(10,Number(e.target.value)||1)))} /></FormField>
                            {scheduleTimes.slice(1).map((time,index)=><div className="app-inline-form" key={index}><input type="time" required aria-label={`Additional daily time ${index+1}`} value={time} onChange={e=>setScheduleTimes(current=>current.map((value,i)=>i===index+1?e.target.value:value))} /><Button type="button" variant="ghost" onClick={()=>setScheduleTimes(current=>current.filter((_,i)=>i!==index+1))}>Remove time</Button></div>)}
                            <Button type="button" variant="outline" disabled={scheduleTimes.length>=8} onClick={()=>setScheduleTimes(current=>[...current,"17:00"])}>Add another daily time</Button>
                          </details>
                          <p aria-live="polite">{editingScheduleSelection?selectedScheduleIds.length:selectedPromptIds.length} prompts × {scheduleSamples} samples × {new Set(scheduleTimes).size} times = <strong>{(editingScheduleSelection?selectedScheduleIds.length:selectedPromptIds.length)*scheduleSamples*new Set(scheduleTimes).size} runs per scheduled day</strong>.</p>
                          <p className="data-note">Each sample/engine variant consumes its own run and provider charges. Normal daily/monthly quotas still apply. Runs queue under the existing concurrency limit. Missed slots do not trigger a historical burst; saving a new batch does not run it.</p>
                          <Button disabled={busy || !(editingScheduleSelection?selectedScheduleIds.length:selectedPromptIds.length) || !scheduleDays.length}>{editingScheduleSelection?"Save settings for selected schedules":"Create paused batch schedule"}</Button>
                          {editingScheduleSelection && <Button type="button" variant="ghost" onClick={()=>setEditingScheduleSelection(false)}>Cancel bulk edit</Button>}
                        </form>
                      ) : (
                        <p className="data-note">Viewer access is read-only.</p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <h2>Workspace schedules</h2>
                      {canWrite && <div className="bulk-toolbar"><label className="check-field"><input type="checkbox" aria-label="Select all schedules in this workspace" checked={schedules.filter(s=>visiblePrompts.some(p=>p.id===s.prompt_id)).length>0 && schedules.filter(s=>visiblePrompts.some(p=>p.id===s.prompt_id)).every(s=>selectedScheduleIds.includes(s.id))} onChange={e=>setSelectedScheduleIds(e.target.checked?schedules.filter(s=>visiblePrompts.some(p=>p.id===s.prompt_id)).map(s=>s.id):[])} />Select all shown</label><span>{selectedScheduleIds.length} selected</span>
                        <Button disabled={busy||!selectedScheduleIds.length} onClick={()=>{if(!confirm("Enable these selected schedules? Each scheduled sample uses provider credits and your run allowance."))return;action(async()=>{await request("/schedules/bulk","PATCH",{ids:selectedScheduleIds,enabled:true});await load();setNotice("Selected schedules enabled.");});}}>Enable selected</Button>
                        <Button variant="outline" disabled={busy||!selectedScheduleIds.length} onClick={()=>action(async()=>{await request("/schedules/bulk","PATCH",{ids:selectedScheduleIds,enabled:false});await load();setNotice("Selected schedules paused.");})}>Pause selected</Button>
                        <Button variant="outline" disabled={!selectedScheduleIds.length} onClick={()=>{const first=schedules.find(s=>selectedScheduleIds.includes(s.id));if(!first)return;setScheduleFrequency(first.preset);setScheduleDays(JSON.parse(first.days));const times=JSON.parse(first.times_json||"[]");setScheduleTimes(times.length?times:[first.local_time]);setScheduleTimezone(first.timezone);setScheduleSamples(first.repetitions||1);setEditingScheduleSelection(true);window.scrollTo({top:0,behavior:"smooth"});}}>Edit selected settings</Button>
                      </div>}
                      {schedules
                        .filter((s) =>
                          visiblePrompts.some((p) => p.id === s.prompt_id),
                        )
                        .map((s) => (
                          <div className="schedule-row" key={s.id}>
                            {canWrite && <input type="checkbox" aria-label={`Select schedule for ${prompts.find(p=>p.id===s.prompt_id)?.text || s.prompt_id}`} checked={selectedScheduleIds.includes(s.id)} onChange={e=>setSelectedScheduleIds(current=>e.target.checked?[...current,s.id]:current.filter(id=>id!==s.id))} />}
                            <div>
                              <strong>
                                {prompts.find((p) => p.id === s.prompt_id)
                                  ?.text || s.prompt_id}
                              </strong>
                              <small>
                                {s.batch_name ? s.batch_name + " · " : ""}{s.preset} · {JSON.parse(s.times_json||"[]").length ? JSON.parse(s.times_json).join(", ") : s.local_time} · {s.repetitions||1} sample(s) · {s.timezone} ·
                                days {JSON.parse(s.days).join(", ")}
                              </small>
                              {canWrite && !s.batch_id && (
                                <details className="schedule-edit">
                                  <summary>Edit timing</summary>
                                  <form
                                    className="app-inline-form"
                                    onSubmit={(e) =>
                                      submit(e, async (f) => {
                                        await request(
                                          "/schedules/" + s.id,
                                          "PATCH",
                                          {
                                            local_time: f.get("local_time"),
                                            timezone: f.get("timezone"),
                                          },
                                        );
                                        setNotice(
                                          "Schedule timing updated. A day already dispatched will not run again.",
                                        );
                                        await load();
                                      })
                                    }
                                  >
                                    <input
                                      type="time"
                                      name="local_time"
                                      required
                                      defaultValue={s.local_time}
                                      aria-label="Schedule local time"
                                    />
                                    <input
                                      name="timezone"
                                      required
                                      defaultValue={s.timezone}
                                      maxLength={100}
                                      aria-label="Schedule timezone"
                                    />
                                    <Button size="sm" disabled={busy}>
                                      Save timing
                                    </Button>
                                  </form>
                                </details>
                              )}
                            </div>
                            <Badge
                              variant={s.enabled ? "secondary" : "outline"}
                            >
                              {s.enabled ? "Enabled" : "Paused"}
                            </Badge>
                            {canWrite && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={
                                    busy ||
                                    (!s.enabled &&
                                      !settings.dataforseo_configured)
                                  }
                                  onClick={() => {
                                    if (
                                      !s.enabled &&
                                      !confirm(
                                        "Enable recurring paid runs using your DataForSEO balance?",
                                      )
                                    )
                                      return;
                                    action(async () => {
                                      await request(
                                        "/schedules/" + s.id,
                                        "PATCH",
                                        { enabled: !s.enabled },
                                      );
                                      await load();
                                    });
                                  }}
                                >
                                  {s.enabled ? "Pause" : "Enable"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => {
                                    if (confirm("Delete this schedule?"))
                                      action(async () => {
                                        await request(
                                          "/schedules/" + s.id,
                                          "DELETE",
                                        );
                                        await load();
                                      });
                                  }}
                                >
                                  Delete
                                </Button>
                              </>
                            )}
                          </div>
                        ))}
                      {!schedules.some((s) =>
                        visiblePrompts.some((p) => p.id === s.prompt_id),
                      ) && (
                        <p className="data-note">
                          No schedules in this workspace.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
              {tab === "team" && (
                <>
                  <Card>
                    <CardContent>
                      <div className="panel-title">
                        <h2>Organization members</h2>
                        <Badge variant="outline">{settings.role}</Badge>
                      </div>
                      <p className="data-note">Unlimited teammates. No per-seat fees. Members share this organization’s workspaces and usage limits.</p>
                      {members.map((m) => (
                        <div className="member-row" key={m.user_id}>
                          <span>
                            <strong>{m.name}</strong>
                            <small>{m.email}</small>
                          </span>
                          <Badge variant="secondary">{m.role}</Badge>
                          {isAdmin &&
                            m.role !== "owner" &&
                            m.user_id !== session.user.id && (
                              <>
                                <select
                                  aria-label={"Role for " + m.name}
                                  value={m.role}
                                  disabled={busy}
                                  onChange={(e) => {
                                    const role = e.target.value;
                                    action(async () => {
                                      await request(
                                        "/members/" + m.user_id,
                                        "PATCH",
                                        { role },
                                      );
                                      setMembers(
                                        (await request("/members")).members,
                                      );
                                    });
                                  }}
                                >
                                  <option value="viewer">Viewer</option>
                                  <option value="member">Member</option>
                                  {settings.role === "owner" && (
                                    <option value="admin">Admin</option>
                                  )}
                                </select>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => {
                                    if (
                                      confirm(
                                        "Remove this team member? Their API access will stop immediately.",
                                      )
                                    )
                                      action(async () => {
                                        await request(
                                          "/members/" + m.user_id,
                                          "DELETE",
                                        );
                                        setMembers(
                                          (await request("/members")).members,
                                        );
                                      });
                                  }}
                                >
                                  Remove
                                </Button>
                              </>
                            )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  {isAdmin && (
                    <Card>
                      <CardContent>
                        <h2>Invite a teammate</h2>
                        <p className="data-note">
                          Create a single-use invitation valid for seven days.
                          Only the named recipient can accept after signing in with a verified email. No email is sent automatically; share the link privately.
                        </p>
                        <form
                          className="app-inline-form"
                          onSubmit={(e) =>
                            submit(e, async (f) => {
                              const d = await request("/invites", "POST", {
                                email: f.get("email"),
                                role: f.get("role"),
                              });
                              setInvite(d.url);
                              setInvites((await request("/invites")).invites);
                            })
                          }
                        >
                          <input name="email" type="email" required maxLength={254} placeholder="teammate@example.com" aria-label="Invited email address" />
                          <select name="role" aria-label="Invitation role">
                            <option value="member">
                              Member · manage research
                            </option>
                            <option value="viewer">Viewer · read only</option>
                            {settings.role === "owner" && (
                              <option value="admin">
                                Admin · manage team and settings
                              </option>
                            )}
                          </select>
                          <Button disabled={busy}>Create invite link</Button>
                        </form>
                        {invite && (
                          <div className="secret-reveal">
                            <p>
                              Copy this single-use link and share it privately.
                            </p>
                            <input
                              value={invite}
                              readOnly
                              aria-label="Invitation link"
                            />
                            <CopyValue value={invite} />
                          </div>
                        )}
                        {invites
                          .filter(
                            (i) => !i.claimed_by && i.expires_at > Date.now(),
                          )
                          .map((i) => (
                            <div className="simple-row" key={i.id}>
                              <span>
                                {i.recipient_email} · {i.role} invitation · expires{" "}
                                {date(i.expires_at)}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() =>
                                  action(async () => {
                                    await request("/invites/" + i.id, "DELETE");
                                    setInvites(
                                      (await request("/invites")).invites,
                                    );
                                  })
                                }
                              >
                                Revoke
                              </Button>
                            </div>
                          ))}
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
              {tab === "settings" && (
                <>
                  {settings.plan && (
                    <Card>
                      <CardContent>
                        <h2>{settings.plan.name} · {settings.plan.version}</h2>
                        <p className="data-note">Assigned plan allowances; shared by all organization members and API keys. Deployment safety ceilings and your daily run guardrail may be lower.</p>
                        <p>{settings.plan.limits.api_per_minute.toLocaleString()} API operations/minute · {settings.plan.limits.provider_per_minute.toLocaleString()} provider operations/minute · {settings.plan.limits.concurrent_runs} concurrent runs</p>
                        <p>{Number(settings.monthly_usage?.api_operations || 0).toLocaleString()} / {settings.plan.limits.api_per_month.toLocaleString()} monthly API operations · {Number(settings.monthly_usage?.runs || 0).toLocaleString()} / {settings.plan.limits.runs_per_month.toLocaleString()} monthly runs</p>
                        <p className="data-note">Monthly allowances reset on the first UTC. Hosted subscriptions are managed separately from self-hosted installs.</p>
                      </CardContent>
                    </Card>
                  )}
                  <div className="app-metrics">
                    <Card className="app-stat">
                      <CardContent>
                        <span>Today's runs (UTC)</span>
                        <strong>
                          {settings.usage?.runs || 0}
                          <small> / {settings.daily_run_limit}</small>
                        </strong>
                        <small>Run-count guardrail, not a dollar budget</small>
                      </CardContent>
                    </Card>
                    <Card className="app-stat">
                      <CardContent>
                        <span>Provider-reported cost today</span>
                        <strong>
                          $
                          {Number(
                            settings.usage?.reported_provider_cost || 0,
                          ).toFixed(4)}
                        </strong>
                        <small>
                          DataForSEO only; not a billing reconciliation
                        </small>
                      </CardContent>
                    </Card>
                  </div>
                  {isAdmin ? (
                    <>
                      <Card>
                        <CardContent>
                          <div className="panel-title">
                            <h2>DataForSEO credentials</h2>
                            <Badge variant="outline">
                              {settings.dataforseo_configured
                                ? "Connected"
                                : "Not configured"}
                            </Badge>
                          </div>
                          <p className="data-note">
                            Stored encrypted using AES-256-GCM with
                            organization-bound authenticated encryption. Saved
                            passwords are never returned to the browser.
                          </p>
                          <form
                            className="form-stack"
                            onSubmit={(e) =>
                              submit(e, async (f) => {
                                await request("/credentials", "PUT", {
                                  login: f.get("login"),
                                  password: f.get("password"),
                                });
                                setNotice(
                                  "DataForSEO credentials saved securely.",
                                );
                                await load();
                              })
                            }
                          >
                            <div className="form-grid">
                              <FormField label="API login">
                                <input
                                  name="login"
                                  autoComplete="off"
                                  required
                                  maxLength={200}
                                />
                              </FormField>
                              <FormField
                                label="API password"
                                hint="Use the API password from DataForSEO API Access."
                              >
                                <input
                                  name="password"
                                  type="password"
                                  autoComplete="new-password"
                                  required
                                  maxLength={500}
                                />
                              </FormField>
                            </div>
                            <Button disabled={busy}>
                              <ShieldCheck size={14} /> Save credentials
                            </Button>
                          </form>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent>
                          <div className="panel-title">
                            <h2>OpenRouter analysis (optional)</h2>
                            <Badge variant="outline">
                              {settings.openrouter_configured
                                ? "Key saved"
                                : "Not configured"}
                            </Badge>
                          </div>
                          <p className="data-note">
                            Collection never uses model calls. OpenRouter is
                            used only when you explicitly choose Analyze on a
                            collected run. Its inference charges are separate
                            from DataForSEO and the run-count guardrail.
                          </p>
                          <form
                            className="form-stack"
                            onSubmit={(e) =>
                              submit(e, async (f) => {
                                await request("/credentials", "PUT", {
                                  openrouter_key: f.get("openrouter_key"),
                                  openrouter_model: f.get("openrouter_model"),
                                });
                                setNotice(
                                  "OpenRouter settings saved securely.",
                                );
                                await load();
                              })
                            }
                          >
                            <div className="form-grid">
                              <FormField label="OpenRouter API key">
                                <input
                                  type="password"
                                  name="openrouter_key"
                                  autoComplete="new-password"
                                  required
                                  maxLength={500}
                                />
                              </FormField>
                              <FormField
                                label="Model identifier"
                                hint="Choose a model available in your OpenRouter account."
                              >
                                <input
                                  name="openrouter_model"
                                  required
                                  defaultValue={settings.openrouter_model || ""}
                                  placeholder="provider/model-name"
                                  maxLength={150}
                                />
                              </FormField>
                            </div>
                            <Button disabled={busy}>
                              Save analysis settings
                            </Button>
                          </form>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent>
                          <h2>Poisoned-SERP fixer & collection defaults</h2>
                          <form
                            className="form-stack"
                            onSubmit={(e) =>
                              submit(e, async (f) => {
                                await request("/settings", "PATCH", {
                                  resolve_poisoned_results:
                                    f.get("clean") === "on",
                                  daily_run_limit: Number(f.get("limit")),
                                });
                                setNotice("Organization settings saved.");
                                await load();
                              })
                            }
                            key={
                              settings.resolve_poisoned_results +
                              "-" +
                              settings.daily_run_limit
                            }
                          >
                            <label className="check-field">
                              <input
                                type="checkbox"
                                name="clean"
                                defaultChecked={
                                  !!settings.resolve_poisoned_results
                                }
                              />{" "}
                              Poisoned-SERP fixer — on by default (recommended)
                            </label>
                            <p className="data-note">
                              Enabled by default. Adds the provider's
                              clean-results parameter to Google collection and
                              can incur additional provider charges.
                              Asynchronous AI Overview loading is also enabled.
                            </p>
                            <FormField
                              label="Daily run-count limit"
                              hint="Shared organization run-count guardrail; resets at midnight UTC. This is not a guaranteed dollar-spending cap."
                            >
                              <input
                                type="number"
                                name="limit"
                                min={1}
                                max={1000000}
                                defaultValue={settings.daily_run_limit || 20}
                                required
                              />
                            </FormField>
                            <Button disabled={busy}>Save defaults</Button>
                          </form>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent>
                          <h2>Remove provider credentials</h2>
                          <p className="data-note">
                            Removes both provider configurations and pauses
                            every schedule. Collected history remains.
                          </p>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              if (
                                confirm(
                                  "Remove all provider credentials and pause every schedule?",
                                )
                              )
                                action(async () => {
                                  await request("/credentials", "DELETE");
                                  setNotice(
                                    "Credentials removed; schedules paused.",
                                  );
                                  await load();
                                });
                            }}
                          >
                            Remove credentials & pause schedules
                          </Button>
                        </CardContent>
                      </Card>
                    </>
                  ) : (
                    <Card>
                      <CardContent>
                        <p>
                          Only organization owners and administrators can view
                          and change provider settings.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
              {tab === "agents" && (
                <>
                  <Card>
                    <CardContent>
                      <div className="panel-title">
                        <h2>Connect your agent</h2>
                        <Badge variant="secondary">Streamable HTTP MCP</Badge>
                      </div>
                      <p className="data-note">
                        Create an organization API key, then configure your
                        client with this MCP endpoint and Authorization header.
                        Keys are scoped, expiring, and shown only once. All keys and members share an organization rate limit; agents must honor retry delays.
                      </p>
                      <pre className="code-block">
                        {JSON.stringify(
                          {
                            mcpServers: {
                              trackrank: {
                                type: "http",
                                url: location.origin + "/mcp",
                                headers: {
                                  Authorization:
                                    "Bearer YOUR_TRACKRANK_API_KEY",
                                },
                              },
                            },
                          },
                          null,
                          2,
                        )}
                      </pre>
                      <CopyValue
                        value={JSON.stringify(
                          {
                            mcpServers: {
                              trackrank: {
                                type: "http",
                                url: location.origin + "/mcp",
                                headers: {
                                  Authorization:
                                    "Bearer YOUR_TRACKRANK_API_KEY",
                                },
                              },
                            },
                          },
                          null,
                          2,
                        )}
                        label="Copy configuration"
                      />
                      <div className="agent-steps">
                        <p>
                          <strong>1.</strong> Connect using an API key. Never
                          put your DataForSEO password in your agent config.
                        </p>
                        <p>
                          <strong>2.</strong> Ask the agent to call{" "}
                          <code>get_context</code>, then{" "}
                          <code>list_workspaces</code>.
                        </p>
                        <p>
                          <strong>3.</strong> Create brands and prompts. Require
                          your approval before paid runs or enabled schedules.
                        </p>
                      </div>
                      <h3>REST API</h3>
                      <pre className="code-block">{`curl '${location.origin}/api/v1/workspaces' \\\n  -H 'Authorization: Bearer YOUR_TRACKRANK_API_KEY'`}</pre>
                      <p className="data-note">
                        API keys are bound to one organization; no organization
                        ID is needed. Paid run requests support an
                        Idempotency-Key header. See the repository's docs/API.md
                        for request shapes.
                      </p>
                    </CardContent>
                  </Card>
                  {isAdmin ? (
                    <>
                      <Card>
                        <CardContent>
                          <h2>Create an API key</h2>
                          <form
                            className="form-stack"
                            onSubmit={(e) =>
                              submit(e, async (f) => {
                                const scopes = f.getAll("scopes").map(String);
                                if (!scopes.length)
                                  throw new Error("Choose at least one scope");
                                const d = await request("/keys", "POST", {
                                  name: f.get("name"),
                                  scopes,
                                  expires_in_days: Number(f.get("days")),
                                });
                                setNewKey(d.key);
                                setKeys((await request("/keys")).keys);
                              })
                            }
                          >
                            <div className="form-grid">
                              <FormField label="Key name">
                                <input
                                  name="name"
                                  required
                                  maxLength={100}
                                  placeholder="My agent"
                                />
                              </FormField>
                              <FormField label="Expires in days">
                                <input
                                  name="days"
                                  type="number"
                                  min={1}
                                  max={365}
                                  defaultValue={90}
                                  required
                                />
                              </FormField>
                            </div>
                            <div className="key-scopes">
                              {["read", "write", "run"].map((s) => (
                                <label key={s} className="check-field">
                                  <input
                                    type="checkbox"
                                    name="scopes"
                                    value={s}
                                    defaultChecked={s === "read"}
                                  />
                                  {s === "read"
                                    ? "Read research"
                                    : s === "write"
                                      ? "Create/edit research"
                                      : "Execute paid runs"}
                                </label>
                              ))}
                            </div>
                            <Button disabled={busy}>
                              <KeyRound size={14} /> Create key
                            </Button>
                          </form>
                          {newKey && (
                            <div className="secret-reveal">
                              <strong>
                                Copy this key now. It will not be shown again.
                              </strong>
                              <input
                                value={newKey}
                                readOnly
                                aria-label="New API key"
                              />
                              <CopyValue value={newKey} />
                            </div>
                          )}
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent>
                          <h2>Organization API keys</h2>
                          {keys.map((k) => (
                            <div className="key-row" key={k.id}>
                              <span>
                                <strong>{k.name}</strong>
                                <small>
                                  {k.prefix}… ·{" "}
                                  {JSON.parse(k.scopes).join(", ")} · expires{" "}
                                  {date(k.expires_at)}
                                </small>
                              </span>
                              {k.revoked_at ? (
                                <Badge variant="outline">Revoked</Badge>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => {
                                    if (
                                      confirm(
                                        "Revoke this API key? Connected agents will lose access.",
                                      )
                                    )
                                      action(async () => {
                                        await request(
                                          "/keys/" + k.id,
                                          "DELETE",
                                        );
                                        setKeys((await request("/keys")).keys);
                                      });
                                  }}
                                >
                                  Revoke
                                </Button>
                              )}
                            </div>
                          ))}
                          {!keys.length && (
                            <p className="data-note">
                              No API keys created yet.
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </>
                  ) : (
                    <p className="data-note">
                      Ask your organization owner or admin to create a scoped
                      API key.
                    </p>
                  )}
                </>
              )}
              {["overview", "research", "runs"].includes(tab) && (
                <div className="load-history">
                  <p>
                    {runs.length} organization runs loaded. Charts and research
                    aggregate only loaded runs in the selected filters.
                  </p>
                  {nextRunCursor && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={moreRuns}
                    >
                      Load older runs
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
function HistoryChart({ runs, brandId }: { runs: Item[]; brandId: string }) {
  const days = new Map<string, { n: number; m: number }>();
  for (const r of runs) {
    const b = (r.mentions || []).find((m: Item) => m.brand_id === brandId);
    if (!b) continue;
    const day = new Date(r.created_at).toISOString().slice(0, 10),
      d = days.get(day) || { n: 0, m: 0 };
    d.n++;
    if (b.mentioned) d.m++;
    days.set(day, d);
  }
  const data = [...days]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, v]) => ({ day, rate: (v.m / v.n) * 100, ...v }));
  if (!data.length)
    return (
      <Empty
        title="Real visibility starts here."
        description="Add a brand, save a prompt, and collect an answer. Your history will appear here with actual sample counts."
      />
    );
  const w = 800,
    h = 180,
    pad = 10,
    x = (i: number) =>
      data.length === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (data.length - 1),
    y = (v: number) => h - pad - (v * (h - pad * 2)) / 100;
  return (
    <div className="history-chart">
      <div className="history-axis">
        <span>100%</span>
        <span>50%</span>
        <span>0%</span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`Daily brand mention rate for ${data.length} collected dates`}
      >
        <g stroke="var(--border)" strokeDasharray="4 4">
          <path d={`M0 ${pad}H${w}M0 ${h / 2}H${w}M0 ${h - pad}H${w}`} />
        </g>
        <polyline
          points={data.map((d, i) => `${x(i)},${y(d.rate)}`).join(" ")}
          fill="none"
          stroke="#c3461d"
          strokeWidth="3"
        />
        {data.map((d, i) => (
          <circle
            key={d.day}
            cx={x(i)}
            cy={y(d.rate)}
            r="5"
            fill="#c3461d"
            tabIndex={0}
          >
            <title>
              {d.day}: {Math.round(d.rate)}% · {d.m}/{d.n} answers
            </title>
          </circle>
        ))}
      </svg>
      <div className="history-dates">
        <span>{data[0].day}</span>
        <span>{data[data.length - 1].day}</span>
      </div>
      <details>
        <summary>View daily sample counts</summary>
        <div className="chart-data">
          {data.map((d) => (
            <span key={d.day}>
              {d.day}: {Math.round(d.rate)}% ({d.m}/{d.n})
            </span>
          ))}
        </div>
      </details>
    </div>
  );
}
