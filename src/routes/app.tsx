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
      <span>{label}</span>
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
function App() {
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
    [members, setMembers] = useState<Item[]>([]),
    [keys, setKeys] = useState<Item[]>([]),
    [invites, setInvites] = useState<Item[]>([]),
    [tab, setTab] = useState<Tab>("overview"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [invite, setInvite] = useState(""),
    [newKey, setNewKey] = useState(""),
    [selectedRun, setSelectedRun] = useState<Item | null>(null),
    [editPrompt, setEditPrompt] = useState<Item | null>(null),
    [promptText, setPromptText] = useState(""),
    [ideas, setIdeas] = useState<string[]>([]),
    [nextBefore, setNextBefore] = useState<number | null>(null);
  const activeOrg = useRef(org);
  activeOrg.current = org;
  const isAdmin = ["owner", "admin"].includes(settings.role),
    canWrite = settings.role !== "viewer";
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
          location.assign("/login" + location.hash);
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
          location.assign("/login" + location.hash);
          return;
        }
        if (!mounted) return;
        setSession(s);
        const i = new URLSearchParams(location.hash.slice(1)).get("invite");
        if (i) {
          const accepted = await request("/invites/accept", "POST", { token: i }, "");
          setOrg(accepted.org_id);
          history.replaceState(null, "", "/app");
          setNotice("Invitation accepted. Your team workspace is ready.");
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
    if (!org) return;
    setLoading(true);
    try {
      const results = await Promise.all([
        request("/workspaces"),
        request("/brands"),
        request("/prompts"),
        request("/runs"),
        request("/schedules"),
        request("/settings"),
      ]);
      if (activeOrg.current !== org) return;
      setWorkspaces(results[0].workspaces);
      setBrands(results[1].brands);
      setPrompts(results[2].prompts);
      setRuns(results[3].runs);
      setNextBefore(results[3].next_before);
      setSchedules(results[4].schedules);
      setSettings(results[5]);
      setWorkspace((current) =>
        results[0].workspaces.some((w: Item) => w.id === current)
          ? current
          : results[0].workspaces[0]?.id || "",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load workspace");
    } finally {
      setLoading(false);
    }
  }, [org, request]);
  useEffect(() => {
    setSelectedRun(null);
    setBrand("");
    setNewKey("");
    setInvite("");
    load();
  }, [org, load]);
  useEffect(() => {
    if (!org || !["team", "agents"].includes(tab)) return;
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
  }, [tab, org, isAdmin, request]);
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
  async function runPrompt(p: Item) {
    if (
      !confirm(
        `Run this prompt using your DataForSEO account? Mode: ${p.mode}. Provider charges apply.`,
      )
    )
      return;
    await action(async () => {
      await request("/prompts/" + p.id + "/run", "POST", {});
      setNotice(
        "Run queued. Durable processing continues in the background. Refresh to see results.",
      );
      await load();
      setTab("runs");
    });
  }
  async function moreRuns() {
    await action(async () => {
      const d = await request("/runs?before=" + nextBefore);
      setRuns((current) => [...current, ...d.runs]);
      setNextBefore(d.next_before);
    });
  }
  if (initializing)
    return (
      <main className="app-loading">
        <Loader2 className="animate-spin" size={24} />
        <p>Opening your workspace…</p>
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
          <span>ORGANIZATION</span>
          <select
            value={org}
            onChange={(e) => {
              setOrg(e.target.value);
              setError("");
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
            onClick={load}
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
                      Workspace
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
                              const data = {
                                workspace_id: workspace,
                                brand_id: f.get("brand_id") || null,
                                text: promptText,
                                engine: f.get("engine"),
                                mode: f.get("mode"),
                                location_name: f.get("location_name"),
                                language_code: f.get("language_code"),
                                enabled: f.get("enabled") === "on",
                              };
                              await request(
                                editPrompt
                                  ? "/prompts/" + editPrompt.id
                                  : "/prompts",
                                editPrompt ? "PATCH" : "POST",
                                data,
                              );
                              setPromptText("");
                              setEditPrompt(null);
                              setNotice(
                                "Prompt saved. No provider request has been made.",
                              );
                              await load();
                            })
                          }
                          key={editPrompt?.id || "new"}
                        >
                          <FormField label="Prompt">
                            <textarea
                              name="text"
                              required
                              minLength={3}
                              maxLength={700}
                              value={promptText}
                              onChange={(e) => setPromptText(e.target.value)}
                              placeholder="Who are the best house cleaning services in Seattle?"
                              rows={3}
                            />
                          </FormField>
                          <div className="form-grid">
                            <FormField label="Engine">
                              <select
                                name="engine"
                                defaultValue={editPrompt?.engine || "chatgpt"}
                              >
                                {Object.entries(engines).map(([v, l]) => (
                                  <option key={v} value={v}>
                                    {l}
                                  </option>
                                ))}
                              </select>
                            </FormField>
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
                            <FormField
                              label="Location"
                              hint="Use a supported DataForSEO location name."
                            >
                              <input
                                name="location_name"
                                required
                                defaultValue={
                                  editPrompt?.location_name || "United States"
                                }
                                maxLength={200}
                              />
                            </FormField>
                            <FormField label="Language code">
                              <input
                                name="language_code"
                                required
                                defaultValue={editPrompt?.language_code || "en"}
                                pattern="[a-z]{2}(-[A-Z]{2})?"
                              />
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
                            <label className="check-field">
                              <input
                                type="checkbox"
                                name="enabled"
                                defaultChecked={
                                  editPrompt ? !!editPrompt.enabled : true
                                }
                              />{" "}
                              Enabled for runs
                            </label>
                          </div>
                          <div className="form-actions">
                            <Button disabled={busy}>
                              <Plus size={14} />
                              {editPrompt ? "Save changes" : "Save prompt"}
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
                      {visiblePrompts.length ? (
                        <div className="prompt-table">
                          {visiblePrompts.map((p) => (
                            <div className="saved-prompt" key={p.id}>
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
                      <h2>Workspace brand set</h2>
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
                        <h2>Schedule a prompt</h2>
                        <Badge variant="outline">
                          Every-five-minute dispatcher
                        </Badge>
                      </div>
                      {canWrite ? (
                        <form
                          className="form-stack"
                          onSubmit={(e) =>
                            submit(e, async (f) => {
                              await request("/schedules", "POST", {
                                prompt_id: f.get("prompt_id"),
                                preset: f.get("preset"),
                                days: String(f.get("days") || "1")
                                  .split(",")
                                  .map(Number),
                                local_time: f.get("local_time"),
                                timezone: f.get("timezone"),
                                enabled: false,
                              });
                              setNotice(
                                "Schedule created paused. Enable it when you are ready for recurring provider charges.",
                              );
                              await load();
                            })
                          }
                        >
                          <div className="form-grid">
                            <FormField label="Prompt">
                              <select name="prompt_id" required>
                                <option value="">Select a saved prompt</option>
                                {visiblePrompts.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.text}
                                  </option>
                                ))}
                              </select>
                            </FormField>
                            <FormField label="Frequency">
                              <select name="preset">
                                <option value="daily">Every day</option>
                                <option value="weekly">Once a week</option>
                                <option value="mwf">
                                  Monday, Wednesday, Friday
                                </option>
                                <option value="custom">Custom weekdays</option>
                              </select>
                            </FormField>
                            <FormField label="Local time">
                              <input
                                name="local_time"
                                type="time"
                                defaultValue="09:00"
                                required
                              />
                            </FormField>
                            <FormField label="Timezone">
                              <input
                                name="timezone"
                                defaultValue={
                                  Intl.DateTimeFormat().resolvedOptions()
                                    .timeZone || "America/Los_Angeles"
                                }
                                required
                                maxLength={100}
                              />
                            </FormField>
                            <FormField
                              label="Weekdays (weekly/custom)"
                              hint="0=Sunday, 1=Monday … 6=Saturday. Weekly uses the first day."
                            >
                              <input
                                name="days"
                                defaultValue="1"
                                pattern="[0-6](,[0-6])*"
                                required
                              />
                            </FormField>
                          </div>
                          <Button disabled={busy || !visiblePrompts.length}>
                            <CalendarClock size={14} /> Create paused schedule
                          </Button>
                          <p className="data-note">
                            Runs on selected local days at or shortly after the
                            local time. Timezone-aware, including DST. Missed
                            dispatcher slots catch up later the same day; no
                            historical-day backfill.
                          </p>
                        </form>
                      ) : (
                        <p className="data-note">Viewer access is read-only.</p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <h2>Workspace schedules</h2>
                      {schedules
                        .filter((s) =>
                          visiblePrompts.some((p) => p.id === s.prompt_id),
                        )
                        .map((s) => (
                          <div className="schedule-row" key={s.id}>
                            <div>
                              <strong>
                                {prompts.find((p) => p.id === s.prompt_id)
                                  ?.text || s.prompt_id}
                              </strong>
                              <small>
                                {s.preset} · {s.local_time} · {s.timezone} ·
                                days {JSON.parse(s.days).join(", ")}
                              </small>
                              {canWrite && (
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
                          Share it privately; anyone with the link can claim the
                          assigned role after signing in.
                        </p>
                        <form
                          className="app-inline-form"
                          onSubmit={(e) =>
                            submit(e, async (f) => {
                              const d = await request("/invites", "POST", {
                                role: f.get("role"),
                              });
                              setInvite(d.url);
                              setInvites((await request("/invites")).invites);
                            })
                          }
                        >
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
                                {i.role} invitation · expires{" "}
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
                          <h2>Collection defaults & guardrails</h2>
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
                              Resolve poisoned Google SERPs (recommended)
                            </label>
                            <p className="data-note">
                              Enabled by default. Adds the provider's
                              clean-results parameter to Google collection and
                              can incur additional provider charges.
                              Asynchronous AI Overview loading is also enabled.
                            </p>
                            <FormField
                              label="Daily run-count limit"
                              hint="1–100 per organization, resets at midnight UTC. This is a beta guardrail, not a guaranteed USD spending limit."
                            >
                              <input
                                type="number"
                                name="limit"
                                min={1}
                                max={100}
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
                        Keys are scoped, expiring, and shown only once.
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
                  {nextBefore && (
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
