import "@/components/app-evidence.css";
import { EvidenceReport, EvidenceSources } from "@/components/evidence-report";
import { RunBatch } from "@/components/run-batch";
import { CollectionDetails, CollectionReview, type Readiness } from "@/components/collection-review";
import { defaultMonitoringTiming, MonitoringEditor, monitoringProjection } from "@/components/monitoring-timing";
import { ScheduleBulkEditor } from "@/components/schedule-bulk-editor";
import { Overview, OverviewFilters, useReport } from "@/components/overview";
import { PromptSettingsEditor, type PromptSettings } from "@/components/prompt-settings-editor";
import { PromptSets, type PromptSet } from "@/components/prompt-sets";
import { analyticsQuery, analyticsScope, defaultPeriod, type AnalyticsScope } from "@/lib/analytics-filters";
import { BulkPageNavigation, BulkSelection, changeSelection, useBulkPages } from "@/components/bulk-selection";
import { MAX_PROMPT_TAGS, MAX_PROMPT_TAG_LENGTH, splitPromptTags } from "@/lib/prompt-tags";
import { formatBillingPrice } from "@/lib/billing-price";
import { MAX_COLLECTION_PROMPTS, RUNS_PER_REQUEST, SCHEDULES_PER_REQUEST } from "@/lib/collection-limits";
import { readPendingCollection, savePendingCollection } from "@/lib/pending-collection";
import { inspectPromptInput, MAX_PROMPT_COMBINATIONS } from "@/lib/prompt-input";
import { appLoginPath, parseAppSearch, type AppTab as Tab } from "@/lib/app-location";
import { Tooltip as HelpTooltip } from "radix-ui";
import { LegalLinks } from "@/components/legal-layout";
import { TrialBanner } from "@/components/trial-banner";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProviderCredentialsCard } from "@/components/provider-credentials-card";
import { ResearchDrilldown } from "@/components/research-drilldown";
import { RunStatus, WorkspaceRunHistory } from "@/components/workspace-run-history";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  cloneElement,
  useCallback,
  useEffect,
  useMemo,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type ReactElement,
} from "react";
import {
  BarChart3,
  BookOpen,
  Building2,
  CircleHelp,
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
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
export const Route = createFileRoute("/app")({ validateSearch: parseAppSearch, component: App });
// API JSON has heterogeneous result shapes; keep server secrets out of the client contract.
type Item = Record<string, any>;
const ALL_WORKSPACES = "all";
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
function HelpTip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <HelpTooltip.Provider delayDuration={150}>
      <HelpTooltip.Root open={open} onOpenChange={setOpen}>
        <HelpTooltip.Trigger asChild>
          <button
            type="button"
            className="help-tip"
            aria-label={"About " + label}
            onClick={event => {
              event.preventDefault();
              setOpen(true);
            }}
          >
            <CircleHelp size={16} aria-hidden="true" />
          </button>
        </HelpTooltip.Trigger>
        <HelpTooltip.Portal>
          <HelpTooltip.Content className="help-tip-content" sideOffset={6}>
            {text}
            <HelpTooltip.Arrow className="help-tip-arrow" />
          </HelpTooltip.Content>
        </HelpTooltip.Portal>
      </HelpTooltip.Root>
    </HelpTooltip.Provider>
  );
}
function FormField({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string }>;
  hint?: string;
}) {
  const generatedId = useId();
  const id = children.props.id ?? generatedId;
  const hintId = `${id}-hint`;
  return (
    <div className="app-field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
        id,
        "aria-describedby": [children.props["aria-describedby"], hint && hintId].filter(Boolean).join(" ") || undefined,
      })}
      {hint && <small id={hintId}>{hint}</small>}
    </div>
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
function CopyValue({
  value,
  label = "Copy",
  absolute = false,
}: {
  value: string;
  label?: string;
  absolute?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(absolute ? new URL(value, location.origin).href : value);
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
const billingBlocksWorkspace = (status: unknown) =>
  status === "trial_expired" || status === "choose_plan" || status === "payment_required";

type PendingRunBatch = {
  prompt_ids: string[];
  repetitions: number;
  batch_key: string;
  accepted?: number;
  nextPrompt?: number;
  workspace?: string;
  receipt?: string;
};

async function loadPendingRun(scope: string): Promise<PendingRunBatch | null> {
  const [batch, progress] = await Promise.all([
    readPendingCollection<PendingRunBatch>(scope),
    readPendingCollection<Pick<PendingRunBatch, "batch_key" | "accepted" | "nextPrompt">>(`${scope}:progress`),
  ]);
  if (batch) return progress?.batch_key === batch.batch_key ? { ...batch, ...progress } : batch;
  try {
    const legacy = sessionStorage.getItem(scope);
    return legacy ? JSON.parse(legacy) as PendingRunBatch : null;
  } catch {
    return null;
  }
}

function App() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [promptSelection, setPromptSelection] = useState(new Map<string, Item>());
  const [scheduleSelection, setScheduleSelection] = useState(new Map<string, Item>());
  const selectedScheduleIds = [...scheduleSelection.keys()];
  const [runSamples,setRunSamples]=useState(1);
  const [timing, setTiming] = useState(defaultMonitoringTiming);
  const [review, setReview] = useState<{ type: "run" | "schedule"; data: Readiness; repetitions: number; key: string; receiptId?: string } | null>(null);
  const [draftReview, setDraftReview] = useState<{ payload: string; data: Item; key: string } | null>(null);
  const [editingScheduleSelection,setEditingScheduleSelection]=useState(false);
  const [promptEngineChoices, setPromptEngineChoices] = useState<string[]>(["chatgpt"]);
  const [promptLocation, setPromptLocation] = useState("United States");
  const [promptLanguage, setPromptLanguage] = useState("en");
  const [locationQuery, setLocationQuery] = useState("");
  const [billingMembers, setBillingMembers] = useState<Item[]>([]);
  const [billingMemberSelection, setBillingMemberSelection] = useState(new Map<string, Item>());
  const [providerChoices, setProviderChoices] = useState<Item | null>(null);
  const [providerChoicesLoading, setProviderChoicesLoading] = useState(false);
  const [promptSeparator, setPromptSeparator] = useState("lines");
  const [promptSearch, setPromptSearch] = useState("");
  const [promptEngineFilter, setPromptEngineFilter] = useState("");
  const [promptScheduleFilter, setPromptScheduleFilter] = useState("");
  const [promptBrandFilter, setPromptBrandFilter] = useState("");
  const [promptWorkspace, setPromptWorkspace] = useState("");
  const [workspaceData, setWorkspaceData] = useState<{ key: string; prompts: Item[] } | null>(null);
  const [session, setSession] = useState<Item | null>(null),
    [initializing, setInitializing] = useState(true),
    [orgs, setOrgs] = useState<Item[]>([]),
    [workspaceRecords, setWorkspaces] = useState<Item[]>([]),
    [brands, setBrands] = useState<Item[]>([]),
    [prompts, setPrompts] = useState<Item[]>([]),
    [settings, setSettings] = useState<Item>({}),
    [billing, setBilling] = useState<Item>({}),
    [members, setMembers] = useState<Item[]>([]),
    [keys, setKeys] = useState<Item[]>([]),
    [invites, setInvites] = useState<Item[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [loadedOrg, setLoadedOrg] = useState(""),
    [invite, setInvite] = useState(""),
    [pendingInvite, setPendingInvite] = useState<Item | null>(null),
    [newKey, setNewKey] = useState(""),
    [runDetail, setSelectedRun] = useState<Item | null>(null),
    [promptDetail, setPromptDetail] = useState<Item | null>(null),
    [detailError, setDetailError] = useState(""),
    [promptText, setPromptText] = useState(""),
    [promptTagInput, setPromptTagInput] = useState(""),
    [ideas, setIdeas] = useState<string[]>([]),
    [pendingBatch, setPendingBatch] = useState<{ scope: string; batch: PendingRunBatch } | null>(null);
  const org = search.org ?? orgs[0]?.id ?? "";
  const tab = search.tab ?? "overview";
  const paneName = tab === "workspaces" ? "Workspaces" : nav.find(item => item.id === tab)?.label;
  const workspaces = workspaceRecords.filter(w => !w.archived_at);
  const [editingWorkspace, setEditingWorkspace] = useState("");
  const [editingBrand, setEditingBrand] = useState<Item | null>(null);
  const orgReady = !!org && loadedOrg === org;
  const canSubscribe = billing.can_manage_billing && (!billing.status || ["none", "canceled", "incomplete_expired"].includes(billing.status));
  const workspaceReady = orgReady && !billingBlocksWorkspace(billing.access_status);
  const linkedPrompt = promptDetail?.id === search.prompt && promptDetail?.org_id === org ? promptDetail : null;
  const selectedRun = runDetail?.id === search.run && runDetail?.org_id === org ? runDetail : null;
  const workspace = search.workspace ?? linkedPrompt?.workspace_id ?? selectedRun?.workspace_id ?? ALL_WORKSPACES;
  const allWorkspaces = workspace === ALL_WORKSPACES;
  const workspaceId = allWorkspaces ? "" : workspace;
  const workspaceKey = org + ":" + workspaceId;
  const scoped = workspaceData?.key === workspaceKey ? workspaceData : null;
  const workspaceNames = Object.fromEntries(workspaceRecords.map(w => [w.id, w.archived_at ? w.name + " (deleted)" : w.name]));
  const workspaceName = allWorkspaces ? "All workspaces" : workspaceNames[workspace] || "this workspace";
  const archivedHistory = tab === "runs" && workspaceRecords.some(w => w.id === workspace && w.archived_at);
  const unavailableWorkspace = workspaceReady && !allWorkspaces && !archivedHistory && !workspaces.some(w => w.id === workspace);
  const libraryQuery = new URLSearchParams({ view: "library" });
  if (workspaceId) libraryQuery.set("workspace", workspaceId);
  if (promptSearch.trim()) libraryQuery.set("q", promptSearch.trim());
  if (promptEngineFilter) libraryQuery.set("engine", promptEngineFilter);
  if (promptScheduleFilter) libraryQuery.set("schedule", promptScheduleFilter);
  if (promptBrandFilter) libraryQuery.set("brand", promptBrandFilter);
  if (search.tag) libraryQuery.set("tag", search.tag);
  if (search.set) libraryQuery.set("set", search.set);
  if (search.brand) libraryQuery.set("tracked_brand", search.brand);
  if (search.from) libraryQuery.set("from", search.from);
  if (search.to) libraryQuery.set("to", search.to);
  const libraryPath = "/prompts?" + libraryQuery;
  const savedSelection = [...promptSelection.keys()];
  const selectedEngines = [...new Set([...promptSelection.values()].map(prompt => prompt.engine))].sort().join(",");
  const mixedWorkspaceSelection = new Set([...promptSelection.values()].map(prompt => prompt.workspace_id)).size > 1;
  const selectedRunCount = savedSelection.length * runSamples;
  const promptFilterCount = [promptEngineFilter, promptScheduleFilter, promptBrandFilter, search.tag].filter(Boolean).length;
  const filteredPrompts = !!(promptSearch.trim() || promptEngineFilter || promptScheduleFilter || promptBrandFilter || search.tag || search.set);
  const promptInput = useMemo(() => inspectPromptInput(promptText, promptSeparator), [promptText, promptSeparator]);
  const promptCombinations = promptInput.prompts.length * promptEngineChoices.length;
  const tooManyPromptCombinations = promptCombinations > MAX_PROMPT_COMBINATIONS;
  const promptsToRemove = tooManyPromptCombinations
    ? promptInput.prompts.length - Math.floor(MAX_PROMPT_COMBINATIONS / promptEngineChoices.length)
    : 0;
  const savingWorkspace = workspaceId || promptWorkspace;
  const brandIds = (id: string): string[] => JSON.parse(workspaces.find(w => w.id === id)?.brand_ids || "[]");
  const trackedBrandIds = new Set(brandIds(workspaceId));
  const promptBrandIds = new Set(brandIds(savingWorkspace));
  const scopeBrands = allWorkspaces ? brands : brands.filter(b => trackedBrandIds.has(b.id));
  const promptBrands = brands.filter(b => promptBrandIds.has(b.id));
  const [setRevision, setSetRevision] = useState(0);
  const reportTab = tab === "overview" || tab === "research";
  const linkScope = analyticsScope(search);
  const isScopedHistory = tab === "runs" && Object.values(linkScope).some(Boolean);
  const reportScope = {
    ...defaultPeriod(), ...Object.fromEntries(Object.entries(linkScope).filter(([, value]) => value !== undefined)),
    trackedBrand: linkScope.trackedBrand || scopeBrands.find(b => b.kind !== "competitor")?.id || scopeBrands[0]?.id,
  } as AnalyticsScope;
  const sectionSearch = (nextTab: Tab) => ({
    ...((nextTab === "overview" || nextTab === "research" || nextTab === "runs") && (reportTab || isScopedHistory)
      ? reportTab ? reportScope : linkScope : {}),
    org: org || undefined, workspace, tab: nextTab,
    ...(nextTab === "prompts" && tab === "prompts" ? { tag: search.tag, set: search.set, brand: search.brand, from: search.from, to: search.to } : {}),
    ...(nextTab === "runs" && tab === "runs" ? { metric: search.metric, researchType: search.researchType, researchValue: search.researchValue } : {}),
  });
  function filterByTag(tag: string) {
    setPromptSelection(new Map());
    void navigate({ search: { ...sectionSearch("prompts"), prompt: search.prompt, tag: tag || undefined } });
  }
  function filterBySet(set: string) {
    if (activeWorkspace.current !== workspaceKey || activeOrg.current !== org) return;
    setPromptSelection(new Map());
    void navigate({ search: { ...sectionSearch("prompts"), set: set || undefined } });
  }
  function setTab(nextTab: Tab) {
    if (nextTab !== tab || search.prompt || search.run) void navigate({ search: sectionSearch(nextTab) });
  }
  function setOrg(next: string, replace = false) {
    void navigate({ search: { org: next, tab }, replace, hash: "" });
  }
  function setWorkspace(next: string) {
    void navigate({ search: { org, workspace: next, tab } });
  }
  const batchInFlight = useRef(false);
  const batchScope = org && session ? `trackrank:pending-run:${session.user.id}:${org}` : "";
  const pendingRun = pendingBatch?.scope === batchScope ? pendingBatch.batch : null;
  const [pendingPromptSubmit, setPendingPromptSubmit] = useState<{ scope: string; payload: Item } | null>(null);
  const promptSubmitScope = org && session ? `trackrank:pending-prompts:${session.user.id}:${org}` : "";
  const promptSubmitRetry = pendingPromptSubmit?.scope === promptSubmitScope ? pendingPromptSubmit.payload : null;
  const promptSubmitInFlight = useRef(false);
  useEffect(() => {
    if (!promptSubmitScope) return;
    let active = true;
    readPendingCollection<Item>(promptSubmitScope).then(payload => {
      if (active) setPendingPromptSubmit(payload ? { scope: promptSubmitScope, payload } : null);
    }).catch(() => {});
    return () => { active = false; };
  }, [promptSubmitScope]);
  const activeOrg = useRef(org);
  const activeWorkspace = useRef(workspaceKey);
  activeWorkspace.current = workspaceKey;
  const latestLoad = useRef(0);
  activeOrg.current = org;
  useEffect(() => {
    if (!batchScope) return;
    let canceled = false;
    loadPendingRun(batchScope).then(batch => {
      if (!canceled) setPendingBatch(batch ? { scope: batchScope, batch } : null);
    }).catch(() => { if (!canceled) setPendingBatch(null); });
    return () => { canceled = true; };
  }, [batchScope]);
  const isAdmin = workspaceReady && ["owner", "admin"].includes(settings.role),
    canWrite = workspaceReady && ["owner", "admin", "member"].includes(settings.role);
  const request = useCallback(
    async (
      path: string,
      method = "GET",
      data?: unknown,
      organization = org,
      retryRateLimit = false,
      signal?: AbortSignal,
    ) => {
      const url =
        "/api/v1" +
        path +
        (organization
          ? (path.includes("?") ? "&" : "?") +
            "org=" +
            encodeURIComponent(organization)
          : "");
      const send = () => fetch(url, {
        method, signal,
        headers: { "Content-Type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      let r = await send();
      const retryAfter = Number(r.headers.get("Retry-After"));
      if (retryRateLimit && r.status === 429 && retryAfter > 0 && retryAfter <= 60) {
        await r.body?.cancel();
        if (activeOrg.current === organization) setNotice("Waiting for the request limit to reset. This action will continue automatically.");
        await new Promise(resolve => window.setTimeout(resolve, retryAfter * 1000));
        r = await send();
      }
      const d = (await r.json()) as Item;
      if (!r.ok) {
        if (r.status === 401) {
          location.assign(appLoginPath(location.search, location.hash));
          throw new Error("Please sign in");
        }
        throw new Error(d.error || "Request failed");
      }
      return d;
    },
    [org],
  );
  const readBulkPage = useCallback((path: string, signal: AbortSignal) =>
    request(path, "GET", undefined, org, true, signal), [org, request]);
  const canLoadBulkPages = workspaceReady && !unavailableWorkspace;
  const promptLibraryRevision = useMemo(() => ({ prompts, setRevision }), [prompts, setRevision]);
  const promptPages = useBulkPages(canLoadBulkPages && tab === "prompts" ? libraryPath : null, "prompts", readBulkPage, promptLibraryRevision);
  const savedPrompts = promptPages.current?.rows ?? [];
  const workspaceTags = promptPages.current?.tags ?? [];
  const tagOptions = search.tag && !workspaceTags.includes(search.tag) ? [search.tag, ...workspaceTags] : workspaceTags;
  const workspaceQuery = new URLSearchParams();
  if (workspaceId) workspaceQuery.set("workspace", workspaceId);
  const schedulePages = useBulkPages(canLoadBulkPages && tab === "schedules" ? "/schedules?" + workspaceQuery : null,
    "schedules", readBulkPage, prompts);
  const visibleSchedules = schedulePages.current?.rows ?? [];
  const bulkBusy = busy || promptPages.selecting || schedulePages.selecting;
  const billingSelectableMembers: Item[] = billingMembers.filter(member => member.role !== "owner")
    .map(member => ({ ...member, id: member.user_id }));
  const billingMemberIds = [...billingMemberSelection.keys()];
  useEffect(() => { setPromptSelection(new Map()); }, [org, libraryPath]);
  const reloadOrgs = useCallback(async () => {
    const r = await fetch("/api/v1/organizations");
    const d = (await r.json()) as Item;
    if (!r.ok) throw new Error(d.error || "Unable to load organizations");
    setOrgs(d.organizations);
  }, []);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/api/auth/get-session"),
          s = (await r.json()) as Item;
        if (!s?.user) {
          location.assign(appLoginPath(location.search, location.hash));
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
          void navigate({ search: previous => ({ ...previous, trial: undefined }), replace: true });
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
  useEffect(() => { setBillingMemberSelection(new Map()); setBillingMembers([]); }, [org]);
  const load = useCallback(async () => {
    if (!org || activeOrg.current !== org) return;
    const loadId = ++latestLoad.current;
    const isCurrent = () => activeOrg.current === org && latestLoad.current === loadId;
    setLoading(true);
    try {
      const billingState = await request("/billing");
      if (!isCurrent()) return;
      const delegates = billingState.owner ? (await request("/billing/admins")).members : [];
      if (!isCurrent()) return;
      setBillingMembers(delegates);
      if (billingBlocksWorkspace(billingState.access_status)) {
        setBilling(billingState);
        setLoadedOrg(org);
        return;
      }
      const results = await Promise.all([
        request("/workspaces?include_archived=1"),
        request("/brands"),
        request("/prompts"),
        request("/settings"),
      ]);
      if (!isCurrent()) return;
      setBilling(billingState);
      setWorkspaces(results[0].workspaces);
      setBrands(results[1].brands);
      setPrompts(results[2].prompts);
      setSettings(results[3]);
      setLoadedOrg(org);
    } catch (e) {
      if (isCurrent()) setError(e instanceof Error ? e.message : "Unable to load workspace");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [org, request]);
  useEffect(() => {
    if (!workspaceReady || !workspaceId || unavailableWorkspace || !["runs", "prompts", "schedules"].includes(tab)) return;
    let canceled = false;
    request("/prompts?" + new URLSearchParams({ workspace: workspaceId }))
      .then(page => {
        if (!canceled) setWorkspaceData({ key: workspaceKey, prompts: page.prompts });
      }).catch(error => { if (!canceled) setError(error.message); });
    return () => { canceled = true; };
  }, [workspaceReady, workspaceId, unavailableWorkspace, workspaceKey, prompts, request, tab]);
  useEffect(() => {
    setPromptSearch("");
    setPromptEngineFilter("");
    setPromptScheduleFilter("");
    setPromptBrandFilter("");
    setPromptWorkspace("");
    setEditingWorkspace("");
    setEditingBrand(null);
  }, [org, workspace]);
  useEffect(() => {
    if (initializing || pendingInvite || !org || search.trial || !orgReady) return;
    const defaultWorkspace = search.prompt || search.run
      ? linkedPrompt?.workspace_id ?? selectedRun?.workspace_id
      : workspace;
    if (!search.org || (!search.workspace && defaultWorkspace) || !search.tab) {
      void navigate({
        search: previous => ({ ...previous, org, workspace: previous.workspace ?? defaultWorkspace, tab }),
        replace: true,
      });
    }
  }, [initializing, pendingInvite, org, orgReady, search, workspace, linkedPrompt?.workspace_id, selectedRun?.workspace_id, tab, navigate]);
  const promptDetailVersion = search.prompt ? prompts : null;
  useEffect(() => {
    setDetailError("");
    setPromptDetail(null);
    setSelectedRun(null);
    const detail = search.prompt ?? search.run;
    if (!workspaceReady || !detail || (unavailableWorkspace && !search.prompt)) return;
    const kind = search.prompt ? "prompt" : "run";
    let canceled = false;
    request("/" + kind + "s/" + encodeURIComponent(detail)).then(data => {
      if (canceled) return;
      const item = data[kind];
      if (!item || (kind === "run" && search.workspace && search.workspace !== ALL_WORKSPACES && item.workspace_id !== search.workspace)) {
        setDetailError("This " + kind + " is unavailable in the selected workspace.");
      } else if (kind === "prompt") {
        setPromptDetail(item);
        if (search.workspace && search.workspace !== ALL_WORKSPACES && item.workspace_id !== search.workspace)
          void navigate({ search: previous => ({ ...previous, workspace: item.workspace_id }), replace: true });
      } else {
        setSelectedRun({ ...item, org_id: org });
      }
    }).catch(() => {
      if (!canceled) setDetailError("This " + kind + " is unavailable. Check the link or ask your team for access.");
    });
    return () => { canceled = true; };
  }, [org, workspaceReady, unavailableWorkspace, search.prompt, search.run, search.workspace, request, navigate, promptDetailVersion]);
  useEffect(() => {
    setReview(null);
    setDraftReview(null);
    setScheduleSelection(new Map());
    setEditingScheduleSelection(false);
  }, [org, workspace]);
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
    setEditingScheduleSelection(false);
    setSelectedRun(null);
    setPromptText("");
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
    setPromptText("");
    setPromptTagInput("");
  }, [org, workspace]);
  async function changeCredentials(method: "PUT" | "DELETE", path: string, values?: unknown) {
    setBusy(true);
    try {
      const status = await request(path, method, values);
      if (activeOrg.current !== org) return;
      const { dataforseo_configured, openrouter_configured, openrouter_model } = status;
      setSettings(current => ({ ...current, dataforseo_configured, openrouter_configured, openrouter_model }));
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function changeSelectedPrompts(
    ids: string[], path: string, method: string, data: object, responseField: string, clearCompleted = false,
  ) {
    const activeScope = workspaceKey;
    let processed = 0;
    let changed = 0;
    try {
      while (processed < ids.length && activeOrg.current === org) {
        const pageIds = ids.slice(processed, processed + 100);
        const result = await request(path, method, { ...data, ids: pageIds }, org, true);
        processed += pageIds.length;
        changed += result[responseField];
        if (activeOrg.current !== org) return null;
        if (clearCompleted && activeWorkspace.current === activeScope) {
          setPromptSelection(current => changeSelection(current, pageIds.map(id => ({ id })), false));
        }
        if (processed < ids.length) {
          setNotice(`Processed ${processed.toLocaleString()} of ${ids.length.toLocaleString()} selected prompts.`);
        }
      }
    } catch (error) {
      if (processed) {
        await load();
        const message = error instanceof Error ? error.message : "Request failed.";
        throw new Error(`Processed ${processed.toLocaleString()} of ${ids.length.toLocaleString()} prompts. ${message}`);
      }
      throw error;
    }
    return activeOrg.current === org ? changed : null;
  }
  async function updateSelectedPrompts(path: string, changes: object, message: string) {
    const result = await changeSelectedPrompts(savedSelection, path, "PATCH", changes, "updated");
    if (result === null) return;
    await load();
    if (activeWorkspace.current === workspaceKey && search.tag && "action" in changes && changes.action === "remove") setPromptSelection(new Map());
    setNotice(message);
  }
  function renderPromptSettings(prompt: Item) {
    const current = {
      mode: prompt.mode,
      location_name: prompt.location_name,
      language_code: prompt.language_code,
      brand_id: prompt.brand_id,
      tags: prompt.tags,
    };
    const allowedBrands = new Set(brandIds(prompt.workspace_id));
    return <PromptSettingsEditor key={JSON.stringify([org, prompt.id, current])} engines={prompt.engine}
      busy={bulkBusy} current={current} brands={brands.filter(brand => allowedBrands.has(brand.id))
        .map(brand => ({ id: brand.id, name: brand.name }))} request={request}
      save={(changes: PromptSettings) => action(async () => {
        await request("/prompts/" + encodeURIComponent(prompt.id), "PATCH", changes);
        if (activeOrg.current !== org) return;
        await load();
        setNotice("Engine settings saved.");
      })} />;
  }
  function removePrompts(ids: string[]) {
    if (!confirm(`Delete ${ids.length === 1 ? "this prompt" : ids.length + " prompts"} and their schedules? Previously queued and collected runs stay in Run history.`)) return;
    void action(async () => {
      const deleted = await changeSelectedPrompts(ids, "/prompts/bulk", "DELETE", {}, "deleted", true);
      if (deleted === null) return;
      if (search.prompt && ids.includes(search.prompt)) setTab("prompts");
      await load();
      setNotice(`Deleted ${deleted} ${deleted === 1 ? "prompt" : "prompts"}.`);
    });
  }
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
  const visiblePrompts = scoped?.prompts ?? prompts.filter(p => allWorkspaces || p.workspace_id === workspace);
  const schedulesSelected = selectedScheduleIds.length > 0;
  const setResult = useReport<{ sets: PromptSet[] }>(
    workspaceReady && !unavailableWorkspace && (reportTab || tab === "prompts")
      ? "/prompt-sets?" + analyticsQuery({}, workspace) : "", request, promptLibraryRevision,
  );
  const promptSets = setResult?.data?.sets ?? [];
  const receiptResult = useReport<Item>(workspaceReady && search.receipt && tab === "prompts"
    ? "/prompts/receipts/" + search.receipt : "", request, prompts);
  const receipt = receiptResult?.data;
  const receiptNewIds: string[] = receipt?.prompts.filter((row: Item) => row.outcome === "created").map((row: Item) => row.id) ?? [];
  const previewNew = draftReview?.data.prompts.filter((row: Item) => row.outcome === "new").length ?? 0;
  const draftProjection = monitoringProjection(timing, previewNew);
  const draftAvailable = typeof settings.plan?.limits?.runs_per_month === "number" && typeof settings.monthly_usage?.runs === "number"
    ? Math.max(0, settings.plan.limits.runs_per_month - settings.monthly_usage.runs) : undefined;
  const draftRunError = !settings.dataforseo_configured ? "Connect DataForSEO to run now or start monitoring."
    : draftAvailable !== undefined && previewNew * timing.repetitions > draftAvailable ? "The requested checks exceed your remaining monthly allowance." : "";

  const research = useReport<{ answers: number; items: { kind: string; value: string; title: string; count: number }[] }>(
    workspaceReady && !unavailableWorkspace && tab === "research" && !search.researchValue
      ? "/research?" + analyticsQuery(reportScope, workspace) : "", request, prompts,
  );
  const sources = {
    domains: research?.data?.items.filter(item => item.kind === "domain") ?? [],
    pages: research?.data?.items.filter(item => item.kind === "page") ?? [],
    queries: research?.data?.items.filter(item => item.kind === "query") ?? [],
  };
  const discovered = research?.data?.items.filter(item => item.kind === "brand")
    .map(item => item.value).filter(name => !brands.some(brand => brand.name.toLowerCase() === name.toLowerCase())) ?? [];
  async function savePendingRun(batch: PendingRunBatch | null, progressOnly = false) {
    if (batch && progressOnly) {
      const { batch_key, accepted, nextPrompt } = batch;
      await savePendingCollection(`${batchScope}:progress`, { batch_key, accepted, nextPrompt });
    } else {
      await savePendingCollection(batchScope, batch);
      await savePendingCollection(`${batchScope}:progress`, null);
      try { sessionStorage.removeItem(batchScope); } catch { /* Legacy storage may be disabled. */ }
    }
    if (activeOrg.current === org) setPendingBatch(batch ? { scope: batchScope, batch } : null);
  }
  async function submitRunBatch(batch: PendingRunBatch) {
    if (!batchScope || batchInFlight.current) return;
    batchInFlight.current = true;
    try {
      const submitBatch = async () => {
        const saved = await loadPendingRun(batchScope);
        if (saved && saved.batch_key !== batch.batch_key) throw new Error("Resolve the pending batch before starting another.");
        if (saved) batch = saved;
        await savePendingRun(batch);
        const { prompt_ids, repetitions, batch_key } = batch;
        const pageSize = batch.workspace ? MAX_COLLECTION_PROMPTS : Math.floor(RUNS_PER_REQUEST / repetitions);
        const requested = prompt_ids.length * repetitions;
        for (let offset = batch.nextPrompt ?? 0; offset < prompt_ids.length; offset += pageSize) {
          if (activeOrg.current !== org) return;
          const result = await request("/runs/bulk", "POST", {
            prompt_ids: prompt_ids.slice(offset, offset + pageSize),
            repetitions,
            batch_key: offset ? `${batch_key}-${offset}` : batch_key,
            include_runs: false,
            ...(batch.workspace ? { expected_workspace_id: batch.workspace } : {}),
            ...(batch.receipt ? { receipt_id: batch.receipt } : {}),
          }, org, true);
          const accepted = offset * repetitions + result.accepted;
          await savePendingRun(accepted === requested ? null : {
            ...batch, accepted, nextPrompt: result.complete ? offset + pageSize : offset,
          }, true);
          if (activeOrg.current !== org) return;
          setNotice(`${accepted} of ${requested} runs queued. Provider rate limits and separate provider charges apply.`);
          if (!result.complete) {
            setError(result.error);
            await load();
            if (batch.workspace) void navigate({ search: { org, workspace: batch.workspace, tab: "runs", batch: batch_key, receipt: batch.receipt } });
            return;
          }
        }
        await load();
        if (activeOrg.current === org) {
          if (batch.workspace) void navigate({ search: { org, workspace: batch.workspace, tab: "runs", batch: batch_key, receipt: batch.receipt } });
          else setTab("runs");
        }
      };
      await action(async () => {
        if (!navigator.locks) return submitBatch();
        await navigator.locks.request(batchScope, { ifAvailable: true }, async lock => {
          if (!lock) throw new Error("This collection is being queued in another tab.");
          await submitBatch();
        });
      });
    } finally {
      batchInFlight.current = false;
    }
  }
  async function reviewCollection(ids: string[], repetitions: number, type: "run" | "schedule", receiptId?: string) {
    if (!ids.length) return;
    await action(async () => {
      if (ids.length > MAX_COLLECTION_PROMPTS) throw new Error(`Select at most ${MAX_COLLECTION_PROMPTS.toLocaleString()} combinations per collection batch.`);
      const data = await request("/collection/readiness", "POST", { prompt_ids: ids, repetitions }) as Readiness;
      if (activeOrg.current === org) setReview({ type, data, repetitions, key: crypto.randomUUID(), receiptId });
    });
  }
  async function queuePromptBatch(ids: string[], samples: number) { await reviewCollection(ids, samples, "run"); }
  async function updateSelectedSchedules(changes: object, ids = selectedScheduleIds) {
    for (let offset = 0; offset < ids.length; offset += SCHEDULES_PER_REQUEST) {
      if (activeOrg.current !== org) return false;
      await request("/schedules/bulk", "PATCH", {
        ids: ids.slice(offset, offset + SCHEDULES_PER_REQUEST), ...changes,
      }, org, true);
    }
    return activeOrg.current === org;
  }
  async function createSelectedSchedules(ids: string[], key: string, enabled: boolean) {
    return request("/schedules/bulk", "POST", {
      ...timing, name: timing.name || "Scheduled prompts", prompt_ids: ids, batch_id: key,
      only_unscheduled: true, enabled,
    }, org, true);
  }

  async function confirmCollection(enabled: boolean, ids: string[]) {
    if (!review || !ids.length || busy) return;
    if (review.type === "run") {
      setReview(null);
      await submitRunBatch({ prompt_ids: ids, repetitions: review.repetitions, batch_key: review.key, workspace: review.data.workspace.id,
        receipt: review.receiptId });
      return;
    }
    await action(async () => {
      if (review.receiptId && receipt?.id === review.receiptId && !receipt.action && ids.every(id => receiptNewIds.includes(id))) {
        await submitReceiptAction(receipt.id, receipt.workspace.id, { prompt_ids: ids, schedule: { ...timing, enabled } });
        setReview(null);
        await load();
        return;
      }
      const result = await createSelectedSchedules(ids, review.key, enabled);
      setReview(null);
      setNotice(`${result.schedules.length} schedules ${enabled ? "started" : "saved paused"}. 0 checks queued now.`);
      await load();
    });
  }
  async function submitReceiptAction(id: string, workspace: string, payload: Item) {
    const result = await request("/prompts/receipts/" + id, "POST", payload, org, true);
    if (activeOrg.current !== org) return;
    if (result.error) setError(result.error);
    if (result.run?.accepted) {
      void navigate({ search: { org, workspace, tab: "runs", batch: id, receipt: id } });
    } else {
      void navigate({ search: { org, workspace, tab: "prompts", receipt: id } });
    }
  }

  async function submitReviewedPrompts(payload: Item) {
    if (!promptSubmitScope || promptSubmitInFlight.current) return;
    promptSubmitInFlight.current = true;
    try {
      const submitDraft = async () => {
        const existing = await readPendingCollection<Item>(promptSubmitScope);
        if (existing && JSON.stringify(existing) !== JSON.stringify(payload))
          throw new Error("Resolve the interrupted prompt submission first.");
        await savePendingCollection(promptSubmitScope, payload);
        setPendingPromptSubmit({ scope: promptSubmitScope, payload });
        const result = await request("/prompts/bulk-submit", "POST", payload, org, true);
        await savePendingCollection(promptSubmitScope, null);
        if (activeOrg.current !== org) return;
        setPendingPromptSubmit(null);
        setPromptText("");
        setPromptTagInput("");
        setDraftReview(null);
        if (result.result?.error) setError(result.result.error);
        const targetWorkspace = result.workspace.id;
        void navigate({ search: result.result?.run?.accepted
          ? { org, workspace: targetWorkspace, tab: "runs", batch: result.id, receipt: result.id }
          : { org, workspace: targetWorkspace, tab: "prompts", receipt: result.id,
              ...(workspaceId === targetWorkspace ? { tag: search.tag, set: search.set } : {}) } });
        await load();
      };
      if (navigator.locks) await navigator.locks.request(promptSubmitScope, {ifAvailable: true}, lock => {
        if (!lock) throw new Error("This prompt submission is running in another tab.");
        return submitDraft();
      });
      else await submitDraft();
    } finally {
      promptSubmitInFlight.current = false;
    }
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
          setOrg(accepted.org_id, true);
          setPendingInvite(null);
          await reloadOrgs();
          setNotice("Invitation accepted. Your team workspace is ready.");
        })}>Accept invitation</Button>
        <Button variant="outline" disabled={busy} onClick={() => action(async () => {
          const r = await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
          if (!r.ok) throw new Error("Unable to sign out. Please try again.");
          location.assign(appLoginPath(location.search, location.hash));
        })}>Switch account</Button>
        <Button variant="ghost" disabled={busy} onClick={() => { void navigate({ search, hash: "", replace: true }); setPendingInvite(null); }}>Not now</Button>
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
          <span>WORKSPACE</span>
          <select aria-label="Workspace" value={workspace} disabled={!workspaceReady || busy}
            onChange={e => { setWorkspace(e.target.value); setError(""); setNotice(""); }}>
            <option value={ALL_WORKSPACES}>All workspaces</option>
            {(unavailableWorkspace || archivedHistory) && <option value={workspace}>{workspaceNames[workspace] || "Unavailable workspace"}</option>}
            {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        {canWrite && (
            <details className="create-org">
              <summary>
                <Plus size={14} /> New workspace
              </summary>
              <form
                onSubmit={(e) => {
                  const popover = e.currentTarget.closest("details");
                  return submit(e, async (f) => {
                    const d = await request("/workspaces", "POST", {
                      name: f.get("name"),
                      brand_id: f.get("brand_id") || null,
                    });
                    await load();
                    if (popover) popover.open = false;
                    setWorkspace(d.id);
                  });
                }}
              >
                <input
                  required
                  name="name"
                  maxLength={100}
                  placeholder="Workspace name"
                  aria-label="Workspace name"
                />
                <select name="brand_id" aria-label="Primary brand">
                  <option value="">No primary brand</option>
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
        {workspaceReady && <Link className="workspace-management-link" to="/app" search={sectionSearch("workspaces")}>Manage workspaces</Link>}
        <nav className="app-nav" aria-label="Application">
          {nav.map(({ id, label, Icon }) => (
            <Link
              key={id}
              to="/app"
              search={sectionSearch(id)}
              className={tab === id ? "active" : ""}
              onClick={() => setError("")}
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon size={17} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="app-sidebar-bottom">
          <span>
            {session.user.name}
            <small>{session.user.email}</small>
            {orgs.some(o => o.id === org) && (
              <small><Link className="workspace-org-link" to="/app" search={sectionSearch("settings")}>
                {orgs.find(o => o.id === org)?.name}
              </Link></small>
            )}
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
        {orgReady && billing.access_status === "free_trial" && Number.isFinite(Number(billing.free_trial?.ends_at)) && <TrialBanner endsAt={Number(billing.free_trial.ends_at)}>
          <Link to="/app" search={sectionSearch("settings")} className="trial-banner-link">{billing.can_manage_billing ? "Choose a subscription →" : "View billing / ask your billing admin →"}</Link>
        </TrialBanner>}
        <header className="app-topbar">
          <div>
            <Building2 size={15} />
            <span>
              {orgs.find((o) => o.id === org)?.name || "Your account"}
            </span>
            <span className="app-slash">/</span>
            <strong>{paneName}</strong>
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
          {tab === "settings" && org && (
            <Card><CardContent>
              <h2>Organization</h2>
              <p className="data-note">Team access, billing, credentials, and usage limits are shared across its workspaces.</p>
              <label className="org-switcher">
                <span>Switch organization</span>
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
                  {org && !orgs.some(o => o.id === org) && <option value={org}>Unavailable organization</option>}
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
            </CardContent></Card>
          )}
          {tab === "settings" && orgReady && billing.enabled && <Card><CardContent>
            <p className="section-eyebrow">Billing</p>
            <h2>{billing.access_status === "trial_expired" ? "Your free trial has ended" : billing.access_status === "free_trial" ? "Your 14-day free trial is active" : "Plan & billing"}</h2>
            {billing.access_status === "free_trial" && <p>Trial access until {new Date(billing.free_trial.ends_at).toLocaleString()}. No card is on file for this trial and no automatic charge will happen at expiry.</p>}
            <p>Subscriptions are billed per organization before applicable tax. Your first paid charge is refundable within 7 days. Provider usage is billed separately.</p>
            {billing.access_status === "payment_required" && !billing.risk_hold && <p>Workspace access is paused until your subscription is active.</p>}
            {billing.access_status === "trial_expired" && <p>Your workspace data is retained.{billing.checkout_enabled && billing.can_manage_billing && " Choose a plan to restore access."}</p>}
            {billing.status && billing.status !== "none" && <p>Subscription: {billing.status}{billing.cancel_at_period_end ? ". Cancels at the end of the current period." : "."}</p>}
            {billing.risk_hold ? <p role="alert">Paid access is paused for billing review. Contact support.</p> : null}
            {canSubscribe && billing.checkout_enabled && (billing.offers as { offer_key: string; name: string; price_cents: number; currency: string; interval: string }[]).map(offer => <Button key={offer.offer_key} disabled={busy} onClick={() => { setBusy(true); request("/billing/checkout", "POST", { offer_key: offer.offer_key }).then(r => window.location.assign(r.url)).catch(e => setError(e.message)).finally(() => setBusy(false)); }}>Choose {offer.name} — {formatBillingPrice(offer)}</Button>)}{" "}
            {billing.can_manage_billing && billing.has_stripe_customer && <Button variant="outline" disabled={busy} onClick={() => { setBusy(true); request("/billing/portal", "POST").then(r => window.location.assign(r.url)).catch(e => setError(e.message)).finally(() => setBusy(false)); }}>Manage billing & invoices</Button>}
            {canSubscribe && !billing.checkout_enabled && <p>Checkout is currently unavailable. <Link to="/support">Contact support</Link> for help with billing.</p>}
            {!billing.can_manage_billing && <p>Ask your organization owner or billing administrator to choose a plan or manage billing.</p>}
            {billing.owner && <details><summary>Billing administrators</summary>
              <p className="data-note">Billing access permits plan purchases, invoice access and payment changes without changing workspace roles. Only owners can delegate it.</p>
              {billingSelectableMembers.length > 0 && <BulkSelection rows={billingSelectableMembers} selected={billingMemberSelection}
                disabled={busy} onChange={(rows, checked) => setBillingMemberSelection(current => changeSelection(current, rows, checked))} />}
              {billingSelectableMembers.map(m => <label className="member-row" key={m.id}>
                <input type="checkbox" checked={billingMemberSelection.has(m.id)} onChange={e => setBillingMemberSelection(current => changeSelection(current, [m], e.target.checked))} />
                <span>{m.name} — {m.email}</span><Badge variant="outline">{m.billing_admin ? "Billing admin" : "No billing access"}</Badge>
              </label>)}
              {!billingMembers.some(m => m.role !== "owner") && <p>No other members yet. Invite teammates from Team.</p>}
              {(["grant", "revoke"] as const).map(operation => <Button key={operation} variant="outline" disabled={busy || !billingMemberIds.length} onClick={() => action(async () => {
                await request("/billing/admins", "PATCH", {user_ids: billingMemberIds, action: operation});
                setBillingMembers((await request("/billing/admins")).members);
                setBillingMemberSelection(new Map());
              })}>{operation === "grant" ? "Grant billing access" : "Revoke billing access"} ({billingMemberIds.length})</Button>)}
            </details>}

          </CardContent></Card>}

          {tab === "settings" && (
            <details className="app-structure-guide">
              <summary>When to use a workspace or an organization</summary>
              <p>Give each client a workspace inside your agency organization. A workspace holds its prompts, schedules, run history, and tracked brands. Your agency team, provider credentials, billing, and usage allowance are shared across those workspaces.</p>
              <p>Use a separate organization when a client needs their own billing, provider account, or private team. For example, invite a client to their own organization when they should only see their own work. Organization members can access its workspaces according to their organization role.</p>
            </details>
          )}
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
            tab === "settings" ? null : <Card><CardContent>
              <h2>Workspace access paused</h2>
              <p>Open billing settings to see your plan and payment options. Your existing data stays in this organization.</p>
              <Button asChild><Link to="/app" search={sectionSearch("settings")}>Open billing settings</Link></Button>
            </CardContent></Card>
          ) : unavailableWorkspace ? (
            <Card><CardContent>
              <h2>Workspace unavailable</h2>
              <p>Check the link or ask your team for access.</p>
              <Link to="/app" search={{ org, tab }}>View all workspaces</Link>
            </CardContent></Card>
          ) : (
            <>
              {!(tab === "runs" && selectedRun) && <div className="app-page-heading">
                <div>
                  <p className="section-eyebrow">
                    {tab === "overview"
                      ? "YOUR BRAND, IN CONTEXT"
                      : "TRACKRANK WORKSPACE"}
                  </p>
                  <h1>
                    {tab === "overview"
                      ? "Your next move, clearer."
                      : paneName}
                  </h1>
                  <p>
                    {tab === "overview"
                      ? "Real collected results. No sample data."
                      : tab === "prompts"
                        ? allWorkspaces ? "Prompts across your organization. Choose a workspace when saving new prompts." : `New prompts and future runs belong to ${workspaceName}.`
                        : tab === "runs"
                          ? allWorkspaces ? "Run history across your organization." : `Viewing runs in ${workspaceName}.`
                          : "Organization-scoped research and collaboration."}
                  </p>
                </div>

              </div>}
              {(reportTab || tab === "prompts") && setResult?.error && <p role="alert">{setResult.error}</p>}
              {reportTab && <OverviewFilters
                key={JSON.stringify([org, workspace, tab, search, reportScope])}
                org={org} workspace={workspace} workspaceNames={workspaceNames} scope={reportScope} sets={promptSets} brands={scopeBrands as { id: string; name: string }[]}
                engines={engines} request={request} revision={prompts}
                onChange={scope => void navigate({ search: { org, workspace, tab, ...scope,
                  researchType: search.researchType, researchValue: search.researchValue } })}
              />}
              {tab === "overview" && <Overview org={org} workspace={workspace} scope={reportScope}
                brands={scopeBrands as { id: string; name: string }[]} request={request} revision={prompts} />}
              {tab === "workspaces" && (
                <Card><CardContent>
                  <h2>Manage workspaces</h2>
                  <p className="data-note">Use New workspace in the sidebar to create a workspace.</p>
                  {workspaces.map(w => (
                    <div className="workspace-manager-row" key={w.id}>
                      {editingWorkspace === w.id ? (
                        <form className="form-stack" onSubmit={e => submit(e, async f => {
                          await request("/workspaces/" + w.id, "PATCH", { name: f.get("name"), brand_id: f.get("brand_id") || null });
                          setEditingWorkspace("");
                          await load();
                          setNotice("Workspace updated.");
                        })}>
                          <FormField label="Edit workspace name"><input name="name" required maxLength={100} defaultValue={w.name} /></FormField>
                          <FormField label="Workspace primary brand">
                            <select name="brand_id" defaultValue={w.brand_id || ""}>
                              <option value="">No primary brand</option>
                              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                          </FormField>
                          <div className="form-actions">
                            <Button disabled={busy}>Save workspace</Button>
                            <Button type="button" variant="ghost" onClick={() => setEditingWorkspace("")}>Cancel</Button>
                          </div>
                        </form>
                      ) : (
                        <div className="simple-row">
                          <Link to="/app" search={{ org, workspace: w.id, tab: "overview" }}><strong>{w.name}</strong></Link>
                          {canWrite && <div className="form-actions flex-wrap">
                            <Button size="sm" variant="outline" onClick={() => setEditingWorkspace(w.id)}>Edit workspace</Button>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => {
                              if (!confirm(`Delete ${w.name} and its prompts and schedules? Previously queued and collected runs stay in Run history.`)) return;
                              void action(async () => {
                                await request("/workspaces/" + w.id, "DELETE");
                                if (workspace === w.id) setWorkspace(ALL_WORKSPACES);
                                await load();
                                setNotice("Workspace deleted.");
                              });
                            }}>Delete workspace</Button>
                          </div>}
                        </div>
                      )}
                    </div>
                  ))}
                  {!workspaces.length && <p className="data-note">No active workspaces.</p>}
                </CardContent></Card>
              )}
              {review && <CollectionReview data={review.data} type={review.type} org={org} engines={engines}
                timing={timing} changeTiming={setTiming} busy={busy} confirm={confirmCollection}
                refresh={() => reviewCollection(review.data.combinations.map(row => row.id), review.repetitions, review.type, review.receiptId)}
                resume={ids => action(async () => {
                  if (!await updateSelectedSchedules({ enabled: true }, ids)) return;
                  setReview(null);
                  setNotice(`${ids.length} schedules resumed. 0 checks queued now.`);
                  await load();
                })}
                close={() => setReview(null)} />}
              {tab === "prompts" && (
                <>
                  {search.prompt && (
                    <Card>
                      <CardContent>
                        <div className="panel-title">
                          <h2>Saved prompt</h2>
                          <Button variant="ghost" size="sm" asChild>
                            <Link to="/app" search={sectionSearch("prompts")}>Close prompt</Link>
                          </Button>
                        </div>
                        {detailError ? <p role="alert">{detailError}</p> : linkedPrompt ? (
                          <>
                            <p>{linkedPrompt.text}</p>
                            <p className="data-note">
                              {engines[linkedPrompt.engine]} · {linkedPrompt.location_name} · {linkedPrompt.language_code}
                            </p>
                            {!!linkedPrompt.tags?.length && <div className="flex flex-wrap gap-1">
                              {(linkedPrompt.tags as string[]).map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                            </div>}
                            <CopyValue value={Route.fullPath + "?" + new URLSearchParams({
                              org, workspace: linkedPrompt.workspace_id, tab: "prompts", prompt: linkedPrompt.id,
                            })} label="Copy prompt link" absolute />
                            <details className="advanced-settings">
                              <summary>API details</summary>
                              <CopyValue label="Copy ID" value={linkedPrompt.id} />
                            </details>
                            <Button variant="ghost" size="sm" asChild>
                              <Link to="/app" search={{ ...sectionSearch("runs"), runPrompt: linkedPrompt.id }}>View prompt runs</Link>
                            </Button>
                            {canWrite && <>
                              {renderPromptSettings(linkedPrompt)}
                              <div className="form-actions flex-wrap">
                                <Button variant="outline" size="sm" disabled={busy} onClick={() => removePrompts([linkedPrompt.id])}>Delete prompt</Button>
                              </div>
                            </>}
                          </>
                        ) : <p role="status">Loading prompt…</p>}
                      </CardContent>
                    </Card>
                  )}
                  {promptSubmitRetry && canWrite && <Card><CardContent className="form-stack">
                    <h2>Interrupted prompt submission</h2>
                    <p>Retry the original questions and collection choices using the same operation ID.</p>
                    <div className="form-actions">
                      <Button disabled={busy} onClick={() => action(() => submitReviewedPrompts(promptSubmitRetry))}>Retry prompt submission</Button>
                      <Link to="/app" search={{ org, workspace: promptSubmitRetry.prompts.workspace_id, tab: "prompts", receipt: promptSubmitRetry.prompts.operation_id }}>Check whether the prompts were saved</Link>
                      <Button variant="ghost" disabled={busy} onClick={() => {
                        if (!confirm("Discard this retry? Any checks already admitted will continue.")) return;
                        void action(async () => {
                          await savePendingCollection(promptSubmitScope, null);
                          setPendingPromptSubmit(null);
                        });
                      }}>Discard retry</Button>
                    </div>
                  </CardContent></Card>}
                  {search.receipt && <Card><CardContent className="form-stack">
                    {!receipt && <p role={receiptResult?.error ? "alert" : "status"}>{receiptResult?.error || "Loading prompt receipt…"}</p>}
                    {receipt && <>
                      <h2>{receipt.questions} {receipt.questions === 1 ? "question" : "questions"} saved in {receipt.workspace.name}</h2>
                      <CopyValue absolute label="Copy receipt link" value={Route.fullPath + "?" + new URLSearchParams({
                        org, workspace: receipt.workspace.id, tab: "prompts", receipt: receipt.id,
                      })} />
                      <p>{receiptNewIds.length} new engine combinations · {receipt.saved_combinations - receiptNewIds.length} already saved</p>
                      <p>{receipt.action?.run?.accepted ?? 0} checks queued · {receipt.action?.schedule?.schedules?.length ?? 0} schedules
                        {receipt.action?.schedule ? receipt.action.schedule.enabled ? " active" : " paused" : ""}</p>
                      {receipt.action?.schedule?.schedules.some((row: Item) => row.next_due_at) &&
                        <p>Next scheduled check {new Date(Math.min(...receipt.action.schedule.schedules.filter((row: Item) => row.next_due_at)
                          .map((row: Item) => row.next_due_at))).toLocaleString(undefined, { timeZone: receipt.action.selection.schedule.timezone, timeZoneName: "short" })}</p>}
                      <div className="form-actions">
                        {canWrite && receiptNewIds.length > 0 && <>
                          <Button size="sm" disabled={bulkBusy || !!pendingRun} onClick={() => reviewCollection(receiptNewIds, 1, "run", receipt.id)}>Run {receiptNewIds.length} new combinations</Button>
                          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => reviewCollection(receiptNewIds, 1, "schedule", receipt.id)}>Schedule {receiptNewIds.length} new combinations</Button>
                        </>}
                        {canWrite && !receiptNewIds.length && <Button size="sm" variant="outline" disabled={bulkBusy || !!pendingRun}
                          onClick={() => reviewCollection(receipt.prompts.map((row: Item) => row.id).filter(Boolean), 1, "run", receipt.id)}>Review running existing prompts</Button>}
                        {canWrite && !receiptNewIds.length && <Button size="sm" variant="outline" disabled={bulkBusy}
                          onClick={() => reviewCollection(receipt.prompts.map((row: Item) => row.id).filter(Boolean), 1, "schedule")}>Review scheduling existing prompts</Button>}
                        {receipt.batches?.map((batch: Item) => <Link key={batch.batch_key} to="/app"
                          search={{ org, workspace: batch.workspace_id, tab: "runs", batch: batch.batch_key, receipt: receipt.id }}>
                          View collection batch · {batch.requested} checks
                        </Link>)}
                        {receipt.action && ((receipt.action.selection.run_samples && !receipt.action.run?.complete)
                          || (receipt.action.selection.schedule && !receipt.action.schedule)) &&
                          <Button disabled={busy} variant="outline" onClick={() => action(async () => {
                            await submitReceiptAction(receipt.id, receipt.workspace.id, receipt.action.selection);
                            await load();
                          })}>Retry unfinished action</Button>}
                        <a href="#prompt-library">View in library</a>
                        <Link to="/app" search={{ org, workspace: receipt.workspace.id, tab: "schedules" }}>Manage schedules</Link>
                      </div>
                      <details><summary>View saved combinations</summary>
                        <ul>{receipt.prompts.map((row: Item) => <li key={row.id}><Link to="/app"
                          search={{ org, workspace: receipt.workspace.id, tab: "prompts", prompt: row.id, receipt: receipt.id }}>
                          {row.text} · {engines[row.engine]}</Link></li>)}</ul>
                      </details>
                    </>}
                  </CardContent></Card>}
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
                          Add a research prompt
                        </h2>
                        <Badge variant="secondary">
                          Scraper collection only
                        </Badge>
                      </div>
                      {canWrite ? (
                        <form
                          className="form-stack"
                          onChange={e => {
                            const target = e.target as HTMLElement;
                            const name = target.getAttribute("name");
                            if (name && !name.startsWith("monitoring-weekday-")) setDraftReview(null);
                          }}
                          onSubmit={e => {
                            const intent = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
                            e.preventDefault();
                            const form = e.currentTarget;
                            const f = new FormData(form);
                            void action(async () => {
                              const { prompts: texts, error: inputError } = promptInput;
                              if (inputError) throw new Error(inputError);
                              const selected = f.getAll("engines").map(String);
                              if (!texts.length || !selected.length || !savingWorkspace || tooManyPromptCombinations)
                                throw new Error("Choose a workspace, valid prompts and engines within the batch limit.");
                              const payload = {
                                workspace_id: savingWorkspace, brand_id: f.get("brand_id") || null,
                                texts, engines: selected, tags: splitPromptTags(f.get("tags")),
                                mode: f.get("mode"), location_name: f.get("location_name"), language_code: f.get("language_code"),
                              };
                              const serialized = JSON.stringify(payload);
                              if (intent === "review" || draftReview?.payload !== serialized) {
                                const preview = await request("/prompts/bulk-preview", "POST", payload);
                                setDraftReview({ payload: serialized, data: preview, key: crypto.randomUUID() });
                                return;
                              }
                              const approved = draftReview!.data.prompts.filter((row: Item) => row.outcome === "new")
                                .map((row: Item) => ({ question: texts.indexOf(row.text), engine: row.engine }));
                              const run = intent === "run" || intent === "both";
                              const schedule = intent === "paused" || intent === "monitor" || intent === "both";
                              await submitReviewedPrompts({
                                prompts: { ...payload, operation_id: draftReview!.key },
                                ...(approved.length && (run || schedule) ? { action: {
                                  approved,
                                  ...(run ? { run_samples: timing.repetitions } : {}),
                                  ...(schedule ? { schedule: { ...timing, name: timing.name || "Scheduled prompts", enabled: intent !== "paused" } } : {}),
                                } } : {}),
                              });
                            });
                          }}
                        >
                          {allWorkspaces && (
                            <FormField label="Save prompts to workspace">
                              <select value={promptWorkspace} onChange={e => { setDraftReview(null); setPromptWorkspace(e.target.value); }} required>
                                <option value="">Choose a workspace</option>
                                {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                              </select>
                            </FormField>
                          )}
                          <FormField label="Prompts — paste your list" hint="Paste one question per line. For CSV-style input, change the paste format in Prompt settings.">
                            <textarea
                              name="text"
                              required
                              minLength={3}
                              value={promptText}
                              onChange={(e) => { setDraftReview(null); setPromptText(e.target.value); }}
                              placeholder="Who are the best house cleaning services in Seattle?"
                              rows={3}
                            />
                          </FormField>
                          <p className="data-note" role="status">
                            {promptInput.prompts.length} {promptInput.prompts.length === 1 ? "prompt" : "prompts"} detected
                            {" × "}{promptEngineChoices.length} {promptEngineChoices.length === 1 ? "engine" : "engines"}
                            {" = "}{promptCombinations} combinations. {promptInput.repeated} repeated input {promptInput.repeated === 1 ? "line" : "lines"}. Up to {MAX_PROMPT_COMBINATIONS} per batch.
                          </p>
                          {promptInput.prompts.length > 0 && (
                            <details>
                              <summary>Preview parsed questions</summary>
                              <ol>{promptInput.prompts.slice(0, 5).map(text => <li key={text}>{text}</li>)}</ol>
                              {promptInput.prompts.length > 5 && <details>
                                <summary>Show all {promptInput.prompts.length} questions</summary>
                                <ol>{promptInput.prompts.map(text => <li key={text}>{text}</li>)}</ol>
                              </details>}
                            </details>
                          )}
                          {promptInput.error && <p className="form-error">{promptInput.error}</p>}
                          {tooManyPromptCombinations && (
                            <p className="form-error">
                              Remove at least {promptsToRemove} {promptsToRemove === 1 ? "prompt" : "prompts"}
                              {promptEngineChoices.length > 1 ? " or select fewer engines" : ""} before saving.
                            </p>
                          )}
                          <div className="form-grid">
                            <fieldset className="form-stack prompt-engines"><legend>Engines <HelpTip label="engines" text="Select one or more engines. Each prompt/engine pair is saved separately and consumes its own run when executed. Saving never runs a collection." /></legend>
                              {Object.entries(engines).map(([value,label]) => <label className="check-field" key={value}><input type="checkbox" name="engines" value={value} checked={promptEngineChoices.includes(value)} onChange={e => setPromptEngineChoices(current => e.target.checked ? [...current,value] : current.filter(x => x !== value))} /> {label}</label>)}
                            </fieldset>
                          </div>
                          <details className="advanced-settings">
                            <summary>Prompt settings{promptSeparator === "commas" ? " · Comma-separated" : ""}</summary>
                            <div className="form-grid">
                              <FormField label="Paste format"><select value={promptSeparator} onChange={e => setPromptSeparator(e.target.value)}><option value="lines">One per line — keep commas in prompts</option><option value="commas">Comma-separated — quote prompts containing commas</option></select></FormField>
                              <FormField label="Tags (optional)" hint="Separate tags with commas. Tags apply to each new prompt and engine variant.">
                                <input name="tags" placeholder="brand name, alternatives, seattle location"
                                  maxLength={MAX_PROMPT_TAGS * (MAX_PROMPT_TAG_LENGTH + 2)}
                                  value={promptTagInput} onChange={e => setPromptTagInput(e.target.value)} />
                              </FormField>
                              <FormField
                                label="Queue / execution"
                                hint="Priority and live can cost more. Standard is the default."
                              >
                                <select
                                  name="mode"
                                  defaultValue="standard"
                                >
                                  <option value="standard">Standard queue</option>
                                  <option value="priority">Priority queue</option>
                                  <option value="live">Live</option>
                                </select>
                              </FormField>
                              <fieldset className="app-field app-field-group">
                                <legend>Location</legend>
                                <small id="prompt-location-hint">Search DataForSEO’s supported locations, then choose a match. With several engines checked, only shared locations are offered. Search a city when using Google or Gemini.</small>
                                <input type="search" aria-label="Search supported locations" aria-describedby="prompt-location-hint" placeholder="Search country or city…" value={locationQuery} onChange={e => setLocationQuery(e.target.value)} maxLength={100} />
                                <select aria-label="Selected location" aria-describedby="prompt-location-hint" name="location_name" required value={promptLocation} disabled={providerChoicesLoading || !!providerChoices?.error} onChange={e => setPromptLocation(e.target.value)}>
                                  {(providerChoices?.locations || [promptLocation]).filter(Boolean).map((name:string) => <option key={name} value={name}>{name}</option>)}
                                </select>
                                <small>{providerChoicesLoading ? "Loading supported choices…" : providerChoices?.error || "Select a listed value. Narrow the search for more locations."}</small>
                              </fieldset>
                              <FormField label="Language" hint="Languages supported by every selected engine. Provider codes are shown next to the names; arbitrary codes are rejected.">
                                <select aria-label="Language" name="language_code" required value={promptLanguage} disabled={providerChoicesLoading || !!providerChoices?.error} onChange={e => setPromptLanguage(e.target.value)}>
                                  {(providerChoices?.languages || [{code:"en",name:"English"}]).map((language:Item) => <option key={language.code} value={language.code}>{language.name} ({language.code})</option>)}
                                </select>
                              </FormField>
                              <FormField label="Associated brand (optional)">
                                <select
                                  key={savingWorkspace}
                                  name="brand_id"
                                  defaultValue=""
                                >
                                  <option value="">
                                    No associated brand
                                  </option>
                                  {promptBrands.map((b) => (
                                    <option value={b.id} key={b.id}>
                                      {b.name}
                                    </option>
                                  ))}
                                </select>
                              </FormField>
                            </div>
                          </details>
                          {draftReview && <section className="form-stack">
                            <h3>Review combinations</h3>
                            <p>{previewNew} new · {draftReview.data.prompts.length - previewNew} already saved</p>
                            <details open={draftReview.data.prompts.length <= 10}>
                              <summary>Engine-by-engine matches</summary>
                              <ul>{draftReview.data.prompts.map((row: Item) => (
                                <li key={JSON.stringify([row.text, row.engine])}>{row.text} · {engines[row.engine]} · {row.outcome === "new"
                                  ? "New" : `Already saved · ${row.monitoring === "none" ? "No schedule" : row.monitoring === "paused" ? "Paused schedule" : "Active schedule"}`}</li>
                              ))}</ul>
                            </details>
                            <CollectionDetails org={org} workspaceId={savingWorkspace} workspace={draftReview.data.workspace.name}
                              brands={promptBrands.map(brand => brand.name)}
                              locales={promptEngineChoices.map(engine => `${engines[engine]} · ${promptLocation} · ${promptLanguage}`)}
                              provider={!!settings.dataforseo_configured} available={draftAvailable} />
                            {JSON.parse(draftReview.payload).brand_id && <p>Associated prompt brand {promptBrands.find(brand => brand.id === JSON.parse(draftReview.payload).brand_id)?.name}.</p>}
                            <Button type="button" variant="outline" disabled={busy} onClick={() => action(load)}>Refresh workspace and provider setup</Button>
                            <MonitoringEditor timing={timing} change={setTiming} count={previewNew} />
                            <p>{previewNew * timing.repetitions} checks now if you run. Saving prompts or saving paused schedules queues 0 checks.</p>
                            {draftRunError && <p role="status">{draftRunError}</p>}
                            <div className="form-actions">
                              <Button value="save" variant="outline" disabled={busy}>Save prompts</Button>
                              <Button value="paused" variant="outline" disabled={busy || !previewNew || !draftProjection.valid}>Save with paused {timing.preset === "weekly" ? "weekly " : ""}schedule</Button>
                              <Button value="both" disabled={busy || !previewNew || !draftProjection.valid || !!draftRunError}>Run now &amp; start {timing.preset === "weekly" ? "weekly " : ""}monitoring</Button>
                            </div>
                            <details><summary>Other collection options</summary>
                              <div className="form-actions">
                                <Button value="run" variant="outline" disabled={busy || !previewNew || !!draftRunError}>Run once</Button>
                                <Button value="monitor" variant="outline" disabled={busy || !previewNew || !draftProjection.valid || !settings.dataforseo_configured}>Start monitoring only</Button>
                              </div>
                            </details>
                          </section>}
                          <div className="form-actions">
                            {!draftReview && <Button value="review" disabled={busy || providerChoicesLoading || !providerChoices || !!providerChoices.error ||
                              !savingWorkspace || !promptEngineChoices.length || !promptInput.prompts.length || !!promptInput.error || tooManyPromptCombinations}>
                              <Plus size={14} />
                              Review prompts
                            </Button>}
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
                        disabled={promptSeparator === "commas" && !!promptInput.error}
                        onClick={() => {
                          setPromptText(current => {
                            if (promptSeparator === "commas") {
                              const entry = '"' + i.replaceAll('"', '""') + '"';
                              return current ? `${current},\n${entry}` : entry;
                            }
                            return current ? `${current.replace(/[\r\n]+$/, "")}\n${i}` : i;
                          });
                          setDraftReview(null);
                        }}
                      >
                        {i}
                        <Plus size={13} />
                      </button>
                    ))}
                  </details>
                  <Card id="prompt-library">
                    <CardContent>
                      <div className="panel-title">
                        <h2>Saved prompts</h2>
                      </div>
                        <FormField label="Search saved prompts">
                          <input type="search" value={promptSearch} maxLength={200} placeholder="Search prompt text"
                            onChange={e => { setPromptSearch(e.target.value); setPromptSelection(new Map()); }} />
                        </FormField>
                      <details className="advanced-settings">
                        <summary>Filters{promptFilterCount > 0 && ` (${promptFilterCount} active)`}</summary>
                        <div className="form-grid prompt-filters">
                          <FormField label="Filter by engine">
                            <select value={promptEngineFilter} onChange={e => { setPromptEngineFilter(e.target.value); setPromptSelection(new Map()); }}>
                              <option value="">All engines</option>
                              {Object.entries(engines).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                            </select>
                          </FormField>
                          <FormField label="Filter by schedule">
                            <select value={promptScheduleFilter} onChange={e => { setPromptScheduleFilter(e.target.value); setPromptSelection(new Map()); }}>
                              <option value="">All prompts</option>
                              <option value="active">Actively scheduled</option>
                              <option value="inactive">No active schedule</option>
                            </select>
                          </FormField>
                          <FormField label="Filter by brand or client" hint="Uses the prompt’s brand or its workspace’s primary brand. Switch client workspaces above.">
                            <select value={promptBrandFilter} onChange={e => { setPromptBrandFilter(e.target.value); setPromptSelection(new Map()); }}>
                              <option value="">All brands</option>
                              {scopeBrands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                            </select>
                          </FormField>
                          <FormField label="Filter by tag">
                            <select value={search.tag || ""} onChange={e => filterByTag(e.target.value)}>
                              <option value="">All tags</option>
                              {tagOptions.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                            </select>
                          </FormField>
                        </div>
                      </details>
                      {!!scopeBrands.length && <details className="advanced-settings">
                        <summary>Mention metrics{search.brand ? ` · ${scopeBrands.find(brand => brand.id === search.brand)?.name ?? "Brand selected"}` : ""}</summary>
                        <form className="form-grid prompt-filters" onSubmit={event => {
                          event.preventDefault();
                          const values = new FormData(event.currentTarget);
                          void navigate({ search: { ...sectionSearch("prompts"), brand: String(values.get("tracked_brand") || "") || undefined,
                            from: String(values.get("from") || "") || undefined, to: String(values.get("to") || "") || undefined } });
                        }}>
                          <FormField label="Mention metrics brand"><select name="tracked_brand" defaultValue={search.brand ?? ""}>
                            <option value="">Choose a brand</option>
                            {scopeBrands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                          </select></FormField>
                          <FormField label="From (UTC)"><input name="from" type="date" defaultValue={search.from ?? defaultPeriod().from} /></FormField>
                          <FormField label="To (UTC)"><input name="to" type="date" defaultValue={search.to ?? defaultPeriod().to} /></FormField>
                          <Button variant="outline">Show mention fractions</Button>
                        </form>
                      </details>}
                      {promptPages.current && (
                        <p className="data-note" role="status">
                          {promptPages.current.total.toLocaleString()} {filteredPrompts ? "matching prompts" : "saved prompts"}
                        </p>
                      )}
                      {(savedPrompts.length > 0 || promptSelection.size > 0) && canWrite && <div className="bulk-toolbar">
                        <BulkSelection rows={savedPrompts} selected={promptSelection} pages={promptPages} disabled={busy}
                          members={group => group.variants} selectionLabel="Engine variants selected"
                          onChange={(rows, checked) => setPromptSelection(current => changeSelection(current, rows, checked))} />
                        <Button disabled={bulkBusy || !!pendingRun || !savedSelection.length || mixedWorkspaceSelection} onClick={() => queuePromptBatch(savedSelection, runSamples)}>Run selected — {selectedRunCount} runs</Button>
                        <Button variant="outline" disabled={bulkBusy || !savedSelection.length || mixedWorkspaceSelection}
                          onClick={() => reviewCollection(savedSelection, 1, "schedule")}>Schedule selected</Button>
                        <Button variant="outline" disabled={bulkBusy || !savedSelection.length}
                          onClick={() => removePrompts(savedSelection)}>Delete selected prompts</Button>
                        {savedSelection.length > 0 && workspaces.length > 1 && (
                          <details>
                            <summary>Move selected prompts</summary>
                            <form className="app-inline-form" onSubmit={e => submit(e, async f => {
                              const destination = f.get("workspace_id");
                              const moved = await changeSelectedPrompts(savedSelection, "/prompts/move", "POST", { workspace_id: destination }, "moved", true);
                              if (moved === null) return;
                              await load();
                              setNotice(`Moved ${moved} ${moved === 1 ? "prompt" : "prompts"} to ${workspaces.find(w => w.id === destination)?.name || "the selected workspace"}.`);
                            })}>
                              <FormField label="Destination workspace">
                                <select name="workspace_id" required defaultValue="">
                                  <option value="" disabled>Choose a workspace</option>
                                  {workspaces.filter(w => w.id !== workspace).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                              </FormField>
                              <Button disabled={bulkBusy}>Move prompts</Button>
                            </form>
                            <p className="data-note">Schedules and future runs follow the prompts. Previously queued and collected runs stay in their original workspace.</p>
                          </details>
                        )}
                        <details>
                          <summary>Advanced · sampling & bulk settings</summary>
                          <FormField label="Samples per engine variant" hint="Independent samples are queued for collection. Each sample is a separate provider charge and run.">
                            <input type="number" min={1} max={10} value={runSamples}
                              onChange={e => setRunSamples(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} />
                          </FormField>
                          {savedSelection.length > 0 && <PromptSettingsEditor key={workspaceKey + selectedEngines}
                            engines={selectedEngines} busy={bulkBusy} request={request}
                            save={changes => action(() => updateSelectedPrompts("/prompts/bulk-settings", changes, "Engine settings updated for selected prompts."))} />}
                        </details>
                      </div>}
                      {canWrite && savedSelection.length > 0 && (
                        <details className="advanced-settings">
                          <summary>Tag selected prompts</summary>
                          <form className="app-inline-form" onSubmit={e => {
                            const operation = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
                            submit(e, async f => {
                              const tags = splitPromptTags(f.get("selected_tags"));
                              if (!tags.length) throw new Error("Enter at least one tag.");
                              await updateSelectedPrompts("/prompts/bulk-tags", { action: operation, tags },
                                operation === "add" ? "Tags added to selected prompts." : "Tags removed from selected prompts.");
                            });
                          }}>
                            <FormField label="Tags for selected prompts">
                              <input name="selected_tags" required placeholder="Enter comma-separated tags"
                                maxLength={MAX_PROMPT_TAGS * (MAX_PROMPT_TAG_LENGTH + 2)} />
                            </FormField>
                            <Button value="add" variant="outline" disabled={bulkBusy}>Add tags</Button>
                            <Button value="remove" variant="outline" disabled={bulkBusy}>Remove tags</Button>
                          </form>
                        </details>
                      )}
                      <PromptSets key={workspaceKey} org={org} workspace={workspace} workspaceNames={workspaceNames}
                        sets={promptSets} activeSet={search.set} selection={promptSelection} canWrite={canWrite}
                        request={request} onFilter={filterBySet} onChange={() => setSetRevision(value => value + 1)} />
                      {mixedWorkspaceSelection && <p className="data-note">Select prompts from one workspace to run them together.</p>}
                      {promptPages.error && <p role="alert">{promptPages.error}</p>}
                      {!promptPages.current ? (!promptPages.error && <p role="status">Loading saved prompts…</p>) :
                        savedPrompts.length ? (
                        <div className="prompt-table">
                          {savedPrompts.map(group => {
                            const variants: Item[] = group.variants;
                            const ids = variants.map(variant => variant.id);
                            const selectedCount = ids.filter(id => promptSelection.has(id)).length;
                            return <section className="saved-prompt" data-selectable={canWrite} key={group.id}>
                              {canWrite && <input type="checkbox" aria-label={`Select ${group.text}`}
                                ref={input => { if (input) input.indeterminate = selectedCount > 0 && selectedCount < variants.length; }}
                                checked={selectedCount === variants.length} disabled={bulkBusy || promptPages.loading}
                                onChange={event => setPromptSelection(current => changeSelection(current, variants, event.target.checked))} />}
                              <div>
                                <div className="prompt-row-title"><strong>{group.text}</strong></div>
                                <small>
                                  {allWorkspaces && workspaceNames[group.workspace_id] && `${workspaceNames[group.workspace_id]} · `}
                                  {[...new Set(variants.map(variant => engines[variant.engine]))].join(" · ")}
                                </small>
                                <details className="prompt-variants" open={search.brand ? true : undefined}>
                                  <summary>Engine settings and results</summary>
                                  {variants.map(p => <div className="prompt-variant" key={p.id}>
                                    <div className="prompt-row-title">
                                      <span className="prompt-engine-icon"><img src={`/engine-icons/${p.engine}.svg`} alt="" width={18} height={18} /></span>
                                      <Link to="/app" search={{ ...sectionSearch("prompts"), workspace: p.workspace_id, prompt: p.id }}>
                                        <strong>{engines[p.engine]}</strong>
                                      </Link>
                                    </div>
                                    <small>
                                      {p.location_name} ·{" "}
                                      {p.language_code} · {p.mode}{" "}
                                      {p.actively_scheduled ? "· Scheduled" : ""}
                                    </small>
                                    {!!p.tags?.length && <div className="flex flex-wrap gap-1">
                                      {(p.tags as string[]).map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                                    </div>}
                                    <p className="data-note">{p.latest_collection ? `Last collection ${date(p.latest_collection.created_at)} · ${p.latest_collection.status === "succeeded"
                                      ? p.latest_collection.has_answer ? "Eligible AI answer" : "Completed without an eligible AI answer" : p.latest_collection.status}` : "No collection in searchable history"}</p>
                                    {p.latest_collection && <Link className="small-link" to="/app" search={{ org, workspace: p.workspace_id, tab: "runs", run: p.latest_collection.id }}>
                                      {p.latest_collection.has_answer ? "View latest answer" : p.latest_collection.has_organic ? "View organic evidence" : "View latest run"}
                                    </Link>}
                                    {p.latest_answer_id && p.latest_answer_id !== p.latest_collection?.id && <Link className="small-link" to="/app"
                                      search={{ org, workspace: p.workspace_id, tab: "runs", run: p.latest_answer_id }}>View latest answer</Link>}
                                    {p.brand_period && <p className="data-note">Mentioned in {p.brand_period.mentions} of {p.brand_period.samples} eligible answers</p>}
                                    {canWrite && renderPromptSettings(p)}
                                    {canWrite && <div className="bulk-selection">
                                      {variants.length > 1 && <label className="check-field">
                                        <input type="checkbox" checked={promptSelection.has(p.id)} disabled={bulkBusy || promptPages.loading}
                                          aria-label={`Select ${engines[p.engine]} for ${group.text} (${p.location_name}, ${p.language_code})`}
                                          onChange={event => setPromptSelection(current => changeSelection(current, [p], event.target.checked))} />
                                        Select variant
                                      </label>}
                                      <Button variant="outline" size="sm" disabled={busy || !!pendingRun}
                                        onClick={() => queuePromptBatch([p.id], 1)}>Run {engines[p.engine]}</Button>
                                      <Button variant="outline" size="sm" disabled={busy}
                                        onClick={() => removePrompts([p.id])}>Delete</Button>
                                    </div>}
                                  </div>)}
                                </details>
                              </div>
                              <div>
                                {canWrite && <Button size="sm" disabled={busy || !!pendingRun}
                                  onClick={() => queuePromptBatch(ids, 1)}>Run {variants.length === 1 ? engines[variants[0].engine] : `all ${variants.length} variants`}</Button>}
                              </div>
                            </section>;
                          })}
                        </div>
                      ) : filteredPrompts ? (
                        <Empty title="No matching prompts" description="Change the filters or search another keyword." />
                      ) : (
                        <Empty
                          title="Ask a better question."
                          description="Save a prompt above. It won't incur charges until you run it or enable a schedule."
                        />
                      )}
                      <BulkPageNavigation pages={promptPages} label="Prompt pages" />
                    </CardContent>
                  </Card>
                </>
              )}
              {tab === "research" && (search.researchType && search.researchValue ? (
                <ResearchDrilldown
                  key={JSON.stringify([org, workspace, reportScope, search.researchType, search.researchValue])}
                  org={org} workspace={workspace} scope={reportScope} type={search.researchType} value={search.researchValue} request={request}
                />
              ) : research?.error ? <p role="alert">{research.error}</p>
                : !research?.data ? <p role="status">Loading research…</p> : (
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
                              <div className="simple-row" key={d.value}>
                                <Link to="/app" search={{ ...sectionSearch("research"), researchType: "domain", researchValue: d.value }}>
                                  <strong>{d.value}</strong>
                                </Link>
                                <span>
                                  {d.count} / {research.data?.answers} answers
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
                              <div className="citation-row" key={p.value}>
                                <Link to="/app" search={{ ...sectionSearch("research"), researchType: "page", researchValue: p.value }}>
                                  <strong>{p.title || p.value}</strong>
                                  <span>{p.value}</span>
                                </Link>
                                <a className="small-link" href={p.value} target="_blank" rel="noreferrer" aria-label="Open original page">
                                  <ExternalLink size={14} />
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
                            sources.queries.map(({ value: q, count }) => (
                              <div className="simple-row" key={q}>
                                <Link to="/app" search={{ ...sectionSearch("research"), researchType: "query", researchValue: q }}>{q}</Link>
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
                                ...(workspaceId ? {workspace_id: workspaceId} : {}),
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
                          No untracked entities found in this view.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </>
              ))}
              {tab === "runs" && (
                <>
                  {search.run && !selectedRun && (
                    <Card><CardContent>
                      {detailError ? <p role="alert">{detailError}</p> : <p role="status">Loading run…</p>}
                      <Link to="/app" search={{ ...sectionSearch("runs"), runPrompt: search.runPrompt, batch: search.batch, receipt: search.receipt }}>Close run</Link>
                    </CardContent></Card>
                  )}
                  {selectedRun && (
                    <Card className="selected-run">
                      <CardContent>
                        <header className="run-detail-header">
                          <h1>{selectedRun.prompt_text}</h1>
                          <Button variant="ghost" size="sm" asChild>
                            <Link to="/app" search={{ ...sectionSearch("runs"), runPrompt: search.runPrompt, batch: search.batch, receipt: search.receipt }}>Close run</Link>
                          </Button>
                          <dl className="run-detail-context">
                            <div><dt>Workspace</dt><dd>{workspaceNames[selectedRun.workspace_id] ?? "Unavailable workspace"}</dd></div>
                            <div><dt>Engine</dt><dd>{engines[selectedRun.config?.engine] ?? "Unknown engine"}</dd></div>
                            <div><dt>Location</dt><dd>{selectedRun.config?.location_name ?? "Not recorded"}</dd></div>
                            <div><dt>Run created</dt><dd><time dateTime={new Date(selectedRun.created_at).toISOString()}>{date(selectedRun.created_at)}</time></dd></div>
                            <div><dt>Status</dt><dd><RunStatus value={selectedRun.status} /></dd></div>
                          </dl>
                        </header>
                        {(selectedRun.error || selectedRun.status === "failed") && (
                          <p className="form-error">{selectedRun.error || "Collection failed. No provider explanation was recorded."}</p>
                        )}
                        {selectedRun.status === "uncertain" && <p className="data-note">Inspect the original task in DataForSEO before initiating another collection. {selectedRun.task_id && `Task ID ${selectedRun.task_id}.`}</p>}
                        {selectedRun.status === "succeeded" && !selectedRun.has_answer && <p className="data-note">This collection produced no eligible AI answer. {selectedRun.config?.engine === "google" && "Open Organic results to inspect the recorded Google links."}</p>}
                        <div className="run-actions">
                          <CopyValue value={Route.fullPath + "?" + new URLSearchParams({
                            org, workspace: selectedRun.workspace_id, tab: "runs", run: selectedRun.id,
                            ...(search.batch ? { batch: search.batch } : {}), ...(search.receipt ? { receipt: search.receipt } : {}),
                            ...(search.evidence ? { evidence: search.evidence } : {}),
                          })} label="Copy run link" absolute />
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
                                  setSelectedRun({ ...d.run, org_id: org });
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
                        <Tabs key={selectedRun.id} value={search.evidence ?? (!selectedRun.has_answer && selectedRun.organic_results?.length ? "organic" : "answer")}
                          onValueChange={value => void navigate({ search: { ...search, org, workspace: selectedRun.workspace_id,
                            tab: "runs", run: selectedRun.id, evidence: value as typeof search.evidence }, replace: true })}>
                          <TabsList variant="line" aria-label="Run evidence">
                            <TabsTrigger value="answer">Answer</TabsTrigger>
                            <TabsTrigger value="citations">
                              Citations
                            </TabsTrigger>
                            <TabsTrigger value="queries">Queries</TabsTrigger>
                            <TabsTrigger value="organic">Organic results</TabsTrigger>
                            <TabsTrigger value="analysis">Analysis</TabsTrigger>
                          </TabsList>
                          <TabsContent value="answer">
                            <EvidenceReport
                              answer={selectedRun.answer_text}
                              observations={(selectedRun.mentions || []).map((mention: Item) => ({
                                label: mention.name,
                                value: `${mention.mentioned ? "Mentioned" : "Not mentioned"}${mention.cited ? " · Cited" : ""}`,
                              }))}
                              sources={selectedRun.citations || []}
                              emptyAnswer={selectedRun.status === "succeeded"
                                ? "No AI answer / AI Overview was present in this collection."
                                : selectedRun.status === "failed" || selectedRun.status === "uncertain"
                                  ? "No AI answer was recorded."
                                  : "Waiting for a result."}
                            />
                          </TabsContent>
                          <TabsContent value="citations">
                            <h3>Sources supplied by the provider</h3>
                            <EvidenceSources sources={selectedRun.citations || []} />
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
                  {search.batch && <CopyValue absolute label="Copy collection batch link" value={Route.fullPath + "?" + new URLSearchParams({
                    org, workspace, tab: "runs", batch: search.batch, ...(search.receipt ? { receipt: search.receipt } : {}),
                  })} />}
                  {search.batch && <RunBatch key={search.batch} org={org} workspace={workspace} batch={search.batch}
                    receipt={search.receipt} request={request} engines={engines} />}
                  {!search.batch && <WorkspaceRunHistory
                    key={JSON.stringify([org, workspace])}
                    org={org}
                    workspace={workspaceId}
                    workspaceName={workspaceName}
                    workspaceNames={workspaceNames}
                    runPrompt={search.runPrompt}
                    prompts={visiblePrompts}
                    brands={scopeBrands}
                    engines={engines}
                    request={request}
                    refresh={prompts}
                    scope={linkScope}
                    metric={search.metric}
                    researchType={search.researchType}
                    researchValue={search.researchValue}
                    filters={search}
                    onChange={patch => {
                      void navigate({ search: { ...search, org, workspace, tab: "runs", ...patch }, replace: "q" in patch });
                    }}
                  />}
                </>
              )}
              {tab === "brands" && (
                <>
                  <Card>
                    <CardContent>
                      <div className="panel-title">
                        <h2>{editingBrand ? "Edit brand" : "Add a brand"}</h2>
                      </div>
                      {canWrite ? (
                        <form
                          key={editingBrand?.id || "new-brand"}
                          className="form-stack"
                          onSubmit={(e) =>
                            submit(e, async (f) => {
                              await request(editingBrand ? "/brands/" + editingBrand.id : "/brands", editingBrand ? "PATCH" : "POST", {
                                ...(!editingBrand && workspaceId ? {workspace_id: workspaceId} : {}),
                                name: f.get("name"),
                                domain: f.get("domain") || "",
                                kind: f.get("kind"),
                                aliases: String(f.get("aliases") || "")
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              });
                              setNotice(
                                editingBrand ? "Brand updated." : workspaceId ? "Brand added and tracked in this workspace." : "Brand added to the organization. Assign it to a workspace to track it.",
                              );
                              setEditingBrand(null);
                              await load();
                            })
                          }
                        >
                          <div className="form-grid">
                            <FormField label="Brand name">
                              <input
                                required
                                name="name"
                                defaultValue={editingBrand?.name}
                                maxLength={100}
                                placeholder="Puget Sound Cleaners"
                              />
                            </FormField>
                            <FormField label="Canonical domain (optional)">
                              <input
                                name="domain"
                                defaultValue={editingBrand?.domain}
                                placeholder="pugetsoundcleaners.com"
                                maxLength={253}
                              />
                            </FormField>
                            <FormField label="Relationship">
                              <select name="kind" defaultValue={editingBrand?.kind || "own"}>
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
                                defaultValue={editingBrand ? JSON.parse(editingBrand.aliases || "[]").join(", ") : ""}
                                maxLength={1500}
                                placeholder="PSC, Puget Sound Cleaning"
                              />
                            </FormField>
                          </div>
                          <div className="form-actions">
                            <Button disabled={busy}>{editingBrand ? "Save brand" : "Add brand"}</Button>
                            {editingBrand && <Button type="button" variant="ghost" onClick={() => setEditingBrand(null)}>Cancel</Button>}
                          </div>
                        </form>
                      ) : (
                        <p className="data-note">Viewer access is read-only.</p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      {!allWorkspaces && <><h2>Workspace brand set <HelpTip label="brands" text="Brands are the businesses you want to measure in answers: your company, clients and competitors. A workspace can track several brands together for comparison." /></h2>
                      <p className="data-note">
                        Future runs track the brands assigned here. Add a brand to start tracking mentions and citations.
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
                      </>}
                      <h2 style={{ marginTop: 25 }}>{allWorkspaces ? "Organization brands" : "Tracked brands"}</h2>
                      {scopeBrands.length ? (
                        scopeBrands.map((b) => (
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
                            <div className="form-actions">
                              <Badge variant="outline">{b.kind}</Badge>
                              {canWrite && <>
                                <Button size="sm" variant="outline" disabled={busy} onClick={() => {
                                  setEditingBrand(b);
                                  window.scrollTo({ top: 0, behavior: "smooth" });
                                }}>Edit brand</Button>
                                <Button size="sm" variant="outline" disabled={busy} onClick={() => {
                                  if (!confirm(`Delete ${b.name} from this organization and all its workspaces? Existing run evidence stays available.`)) return;
                                  void action(async () => {
                                    await request("/brands/" + b.id, "DELETE");
                                    if (editingBrand?.id === b.id) setEditingBrand(null);
                                    await load();
                                    setNotice("Brand deleted.");
                                  });
                                }}>Delete brand</Button>
                              </>}
                              {!allWorkspaces && canWrite && <Button size="sm" variant="ghost" disabled={busy}
                                onClick={() => action(async () => {
                                  await request("/workspaces/" + workspaceId + "/brands/" + b.id, "DELETE");
                                  await load();
                                })}>Unlink</Button>}
                            </div>
                          </div>
                        ))
                      ) : (
                        <Empty
                          title="One home for every brand."
                          description={allWorkspaces ? "Add brands to reuse across workspaces." : "Add or assign a brand to track it in this workspace."}
                        />
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
              {tab === "schedules" && (
                <>
                  {editingScheduleSelection && !!selectedScheduleIds.length && <Card><CardContent>
                    <h2>Edit selected schedules</h2>
                    <ScheduleBulkEditor key={selectedScheduleIds.join(",")}
                      rows={[...scheduleSelection.values()] as React.ComponentProps<typeof ScheduleBulkEditor>["rows"]} busy={bulkBusy}
                      save={patch => action(async () => {
                        if (!await updateSelectedSchedules(patch)) return;
                        setEditingScheduleSelection(false);
                        setScheduleSelection(new Map());
                        await load();
                        setNotice("Schedule settings updated.");
                      })}
                      cancel={() => setEditingScheduleSelection(false)} />
                  </CardContent></Card>}
                  <Card>
                    <CardContent>
                      <div className="panel-title">
                        <h2>{allWorkspaces ? "Schedules across workspaces" : "Workspace schedules"}</h2>
                        {canWrite && <Button variant="outline" asChild><Link to="/app" search={{ org, workspace, tab: "prompts" }}>Schedule prompts</Link></Button>}
                      </div>
                      {canWrite && <div className="bulk-toolbar">
                        <BulkSelection rows={visibleSchedules} selected={scheduleSelection} pages={schedulePages} disabled={busy}
                          onChange={(rows, checked) => setScheduleSelection(current => changeSelection(current, rows, checked))} />
                        <Button disabled={bulkBusy || !schedulesSelected} onClick={()=>{if(!confirm("Enable these selected schedules? Each scheduled sample uses provider credits and your run allowance."))return;action(async()=>{if (!await updateSelectedSchedules({ enabled:true })) return;await load();setNotice("Selected schedules enabled.");});}}>Enable selected</Button>
                        <Button variant="outline" disabled={bulkBusy || !schedulesSelected} onClick={()=>action(async()=>{if (!await updateSelectedSchedules({ enabled:false })) return;await load();setNotice("Selected schedules paused.");})}>Pause selected</Button>
                        <Button variant="outline" disabled={bulkBusy || !schedulesSelected} onClick={()=>{setEditingScheduleSelection(true);window.scrollTo({top:0,behavior:"smooth"});}}>Edit selected settings</Button>
                      </div>}
                      {visibleSchedules.map((s) => (
                          <div className="schedule-row" key={s.id}>
                            {canWrite && <input type="checkbox" aria-label={`Select schedule for ${s.prompt_text || s.prompt_id}`} checked={scheduleSelection.has(s.id)} disabled={bulkBusy || schedulePages.loading} onChange={e => setScheduleSelection(current => changeSelection(current, [s], e.target.checked))} />}
                            <div>
                              <strong>
                                {s.prompt_text || s.prompt_id}
                              </strong>
                              <small>
                                {allWorkspaces && workspaceNames[s.workspace_id] && `${workspaceNames[s.workspace_id]} · `}{s.batch_name ? s.batch_name + " · " : ""}{s.preset} · {s.next_due_at ? `Next ${new Date(s.next_due_at).toLocaleString(undefined, {timeZone: s.timezone, timeZoneName: "short"})} · ` : ""}{JSON.parse(s.times_json).join(", ")} · {s.repetitions} sample(s) · {s.timezone} ·
                                days {JSON.parse(s.days).join(", ")}
                              </small>
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
                                        "/schedules/bulk",
                                        "PATCH",
                                        { ids: [s.id], enabled: !s.enabled },
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
                                        if (activeWorkspace.current === workspaceKey) {
                                          setScheduleSelection(current => changeSelection(current, [s], false));
                                        }
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
                      {schedulePages.error && <p role="alert">{schedulePages.error}</p>}
                      {!schedulePages.error && !visibleSchedules.length && <p className="data-note" role="status">
                        {schedulePages.current ? "No schedules in this view." : "Loading schedules…"}
                      </p>}
                      <BulkPageNavigation pages={schedulePages} label="Schedule pages" />
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
                          {(m.billing_admin || m.role === "owner") ? <Badge variant="outline">Billing access</Badge> : null}
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
                        <h2>{settings.plan.name}</h2>
                        <p className="data-note">Plan allowances are shared by all organization members and API keys.</p>
                        <p>{settings.plan.limits.api_per_minute.toLocaleString()} API operations/minute · {settings.plan.limits.provider_per_minute.toLocaleString()} Standard/Priority batch requests/minute · {settings.plan.limits.provider_per_minute.toLocaleString()} Live requests/minute</p>
                        <p>{Number(settings.monthly_usage?.runs || 0).toLocaleString()} / {settings.plan.limits.runs_per_month.toLocaleString()} monthly runs</p>
                        {settings.plan.limits.searchable_history_days && <p>{settings.plan.limits.searchable_history_days} days of searchable history</p>}
                        <p className="data-note">The run allowance resets at midnight UTC on the first day of each month.</p>
                      </CardContent>
                    </Card>
                  )}
                  <div className="app-metrics">
                    <Card className="app-stat">
                      <CardContent>
                        <span>Today's runs (UTC)</span>
                        <strong>{settings.usage?.runs || 0}</strong>
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
                      <ProviderCredentialsCard
                        key={org + ":dataforseo"}
                        provider="dataforseo"
                        configured={!!settings.dataforseo_configured}
                        busy={busy}
                        onSave={values => changeCredentials("PUT", "/credentials", values)}
                        onRemove={() => changeCredentials("DELETE", "/credentials/dataforseo")}
                      />
                      <ProviderCredentialsCard
                        key={org + ":openrouter"}
                        provider="openrouter"
                        configured={!!settings.openrouter_configured}
                        model={settings.openrouter_model}
                        busy={busy}
                        onSave={values => changeCredentials("PUT", "/credentials", values)}
                        onRemove={() => changeCredentials("DELETE", "/credentials/openrouter")}
                      />
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
                                });
                                setNotice("Organization settings saved.");
                                await load();
                              })
                            }
                            key={settings.resolve_poisoned_results}
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
                            <Button disabled={busy}>Save defaults</Button>
                          </form>
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
            </>
          )}
          {tab === "settings" && <footer className="settings-legal"><LegalLinks /></footer>}
        </main>
      </div>
    </div>
  );
}
