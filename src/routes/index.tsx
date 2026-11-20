import { ThemeToggle } from "@/components/theme-toggle";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ArrowRight,
  AudioLines,
  ChartNoAxesCombined,
  CircleHelp,
  Command,
  Compass,
  ExternalLink,
  Fingerprint,
  Globe2,
  Layers3,
  Link2,
  MessageSquare,
  ScanLine,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/")({ component: Home });

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`brand-mark ${small ? "brand-mark-small" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="M7 23V16M15 23V11M23 23V6"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="square"
        />
        <path d="M5 26H27" stroke="currentColor" strokeWidth="2" />
      </svg>
    </span>
  );
}
function Brand() {
  return (
    <a href="/" className="brand" aria-label="TrackRank home">
      <Mark />
      <span>
        trackrank<span className="brand-suffix">.ai</span>
      </span>
    </a>
  );
}
const prompts = [
  {
    text: "What are the best project management tools?",
    topic: "Product discovery",
    mentioned: true,
    sources: 6,
  },
  {
    text: "Which tools work best for remote teams?",
    topic: "Use case",
    mentioned: true,
    sources: 4,
  },
  {
    text: "What are the alternatives to Acme?",
    topic: "Comparison",
    mentioned: false,
    sources: 5,
  },
];

function Dashboard() {
  return (
    <section
      className="dashboard"
      id="preview"
      aria-labelledby="dashboard-title"
    >
      <aside className="dashboard-sidebar" aria-label="Preview workspace">
        <div className="workspace">
          <span className="workspace-avatar">a</span>
          <span>
            Acme workspace<small>Example workspace</small>
          </span>
        </div>
        <span className="sidebar-label">WORKSPACE PREVIEW</span>
        <div className="sidebar-active">
          <ChartNoAxesCombined size={16} /> Visibility overview
        </div>
        <div className="sidebar-item">
          <MessageSquare size={16} /> Prompt research
        </div>
        <div className="sidebar-item">
          <Link2 size={16} /> Source discovery
        </div>
        <div className="sidebar-item">
          <Layers3 size={16} /> Competitor insights
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <ScanLine size={20} />
            <strong>Your next move, clearer.</strong>
            <p>Connect the answers to the opportunities behind them.</p>
          </div>
          <span>
            <CircleHelp size={14} /> Product concept · not live data
          </span>
        </div>
      </aside>
      <div className="dashboard-main">
        <div className="dashboard-topbar">
          <span>
            <span className="breadcrumb">Workspace</span>
            <span className="breadcrumb-slash">/</span>Overview
          </span>
          <Badge variant="outline" className="sample-badge">
            <span className="status-dot" /> Sample data
          </Badge>
        </div>
        <div className="dashboard-body">
          <div className="dashboard-heading">
            <div>
              <p className="section-eyebrow">THE BIG PICTURE</p>
              <h2 id="dashboard-title">
                Visibility overview<span>.</span>
              </h2>
              <p>Your brand, through the lens of AI.</p>
            </div>
            <span className="period">
              <span className="status-dot" /> Example reporting period
            </span>
          </div>
          <div className="metrics-grid">
            {[
              {
                label: "Brand mentions",
                value: "42",
                unit: "%",
                note: "42 of 100 sample answers",
                icon: MessageSquare,
              },
              {
                label: "Website citations",
                value: "28",
                unit: "%",
                note: "28 of 100 sample answers",
                icon: Link2,
              },
              {
                label: "Tracked prompts",
                value: "25",
                unit: "",
                note: "Questions in this example",
                icon: ScanLine,
              },
            ].map(({ label, value, unit, note, icon: Icon }) => (
              <Card className="metric" key={label}>
                <CardContent>
                  <div className="metric-top">
                    <span>{label}</span>
                    <Icon size={15} />
                  </div>
                  <strong>
                    {value}
                    <span>{unit}</span>
                  </strong>
                  <small>{note}</small>
                </CardContent>
              </Card>
            ))}
          </div>
          <Tabs defaultValue="visibility" className="insight-tabs">
            <TabsList aria-label="Explore example data">
              <TabsTrigger value="visibility">Visibility</TabsTrigger>
              <TabsTrigger value="prompts">Prompts</TabsTrigger>
              <TabsTrigger value="sources">Sources</TabsTrigger>
            </TabsList>
            <TabsContent value="visibility">
              <Card className="chart-card">
                <CardContent>
                  <div className="panel-heading">
                    <div>
                      <h3>A little more visible. Every day.</h3>
                      <p>Illustrative brand mention trend</p>
                    </div>
                    <Badge variant="secondary">
                      <span className="chart-legend-dot" /> Acme
                    </Badge>
                  </div>
                  <div
                    className="chart"
                    role="img"
                    aria-label="Illustrative upward trend ending at a 42 percent brand mention rate; not collected results"
                  >
                    <div className="chart-labels">
                      <span>60%</span>
                      <span>40%</span>
                      <span>20%</span>
                      <span>0%</span>
                    </div>
                    <svg
                      viewBox="0 0 700 156"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <defs>
                        <linearGradient
                          id="chart-fill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#f05a28"
                            stopOpacity=".18"
                          />
                          <stop
                            offset="100%"
                            stopColor="#f05a28"
                            stopOpacity="0"
                          />
                        </linearGradient>
                      </defs>
                      <g stroke="var(--border)" strokeDasharray="4 5">
                        <path d="M0 8H700M0 54H700M0 100H700M0 146H700" />
                      </g>
                      <path
                        d="M0 119L44 115L88 123L132 96L176 104L220 82L264 91L308 67L352 74L396 52L440 62L484 39L528 46L572 21L616 32L660 18L700 24V156H0Z"
                        fill="url(#chart-fill)"
                      />
                      <path
                        d="M0 119L44 115L88 123L132 96L176 104L220 82L264 91L308 67L352 74L396 52L440 62L484 39L528 46L572 21L616 32L660 18L700 24"
                        stroke="#f05a28"
                        strokeWidth="2.5"
                        fill="none"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="chart-dates">
                    <span>Week 1</span>
                    <span>Week 2</span>
                    <span>Week 3</span>
                    <span>Week 4</span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="prompts">
              <Card className="detail-card">
                <CardContent>
                  <div className="panel-heading">
                    <div>
                      <h3>The questions that shape discovery</h3>
                      <p>Three illustrative prompts, not executed queries</p>
                    </div>
                    <ScanLine size={18} />
                  </div>
                  <div className="prompt-list">
                    {prompts.map((p) => (
                      <div className="prompt-row" key={p.text}>
                        <div>
                          <strong>{p.text}</strong>
                          <small>
                            {p.topic} · {p.sources} example sources
                          </small>
                        </div>
                        <Badge variant={p.mentioned ? "secondary" : "outline"}>
                          {p.mentioned ? "Mentioned" : "Not mentioned"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="sources">
              <Card className="detail-card">
                <CardContent>
                  <div className="panel-heading">
                    <div>
                      <h3>Follow the answer to its source</h3>
                      <p>Example source categories, not verified citations</p>
                    </div>
                    <Globe2 size={18} />
                  </div>
                  <div className="source-list">
                    {[
                      [
                        "01",
                        "Industry comparisons",
                        "Independent roundups and product reviews",
                      ],
                      [
                        "02",
                        "Community conversations",
                        "Real questions, recommendations, and experiences",
                      ],
                      [
                        "03",
                        "Your own website",
                        "Product pages, documentation, and useful guides",
                      ],
                    ].map(([n, t, d]) => (
                      <div className="source-row" key={n}>
                        <span>{n}</span>
                        <div>
                          <strong>{t}</strong>
                          <small>{d}</small>
                        </div>
                        <Link2 size={16} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          <p className="dashboard-disclaimer">
            <CircleHelp size={12} /> Interactive concept preview. All metrics
            and trends are illustrative.
          </p>
        </div>
      </div>
    </section>
  );
}

function Home() {
  return (
    <div className="site">
      <header className="header shell">
        <Brand />
        <nav aria-label="Main navigation">
          <ThemeToggle />
          <a href="#product">Product</a>
          <a href="#principles">Why TrackRank</a>
          <Button asChild size="sm">
            <a href="/login">
              Sign in <ArrowUpRight size={14} />
            </a>
          </Button>
        </nav>
      </header>
      <main>
        <section className="hero shell">
          <div className="hero-copy">
            <Badge variant="outline" className="hero-badge">
              <span className="status-dot" /> A new perspective on AI search{" "}
              <ArrowRight size={12} />
            </Badge>
            <h1>
              Be the brand
              <br />
              in the{" "}
              <span className="headline-accent">
                answer
                <svg
                  viewBox="0 0 360 15"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M3 10 Q150 0 355 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                  />
                </svg>
              </span>
              .
            </h1>
            <p className="hero-description">
              Your next customer is asking AI.
              <br className="desktop-break" /> See where you show up—and what to
              do next.
            </p>
            <div className="hero-actions">
              <Button asChild size="lg">
                <a href="/app">
                  Open your workspace <ArrowUpRight size={17} />
                </a>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <a href="#principles">
                  Built for ownership <ArrowRight size={16} />
                </a>
              </Button>
            </div>
            <p className="availability">
              <span className="status-dot" /> Early beta. Connect your own
              provider accounts.
            </p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <span className="orbit-label">FROM QUESTIONS TO CLARITY</span>
            <div className="art-node art-node-one">
              <Sparkles size={20} />
            </div>
            <div className="art-node art-node-two">
              <Command size={20} />
            </div>
            <div className="art-node art-node-three">
              <AudioLines size={20} />
            </div>
            <div className="signal-card">
              <div className="signal-card-top">
                <span className="signal-icon">
                  <ScanLine size={17} />
                </span>
                <span>BRAND SIGNAL</span>
                <span className="signal-live-dot" />
              </div>
              <p>
                You're part of
                <br />
                the conversation.
              </p>
              <div className="signal-card-bottom">
                <span className="signal-bars">
                  {[12, 20, 16, 28, 24, 36, 30, 44, 39, 52, 46, 60].map(
                    (h, i) => (
                      <i key={i} style={{ height: h }} />
                    ),
                  )}
                </span>
                <span className="signal-arrow">
                  <ArrowUpRight size={26} />
                </span>
              </div>
              <span className="art-caption">
                A clearer view of what comes next.
              </span>
            </div>
            <span className="orbit-coordinate">SIGNAL / 001</span>
          </div>
        </section>
        <section
          className="platform-strip shell"
          aria-label="Product direction"
        >
          <span>
            DISCOVERY IS CHANGING.
            <br />
            <strong>Stay in the conversation.</strong>
          </span>
          <div>
            <Sparkles size={19} /> AI answers
          </div>
          <div>
            <Link2 size={19} /> Cited sources
          </div>
          <div>
            <TrendingUp size={19} /> Brand visibility
          </div>
          <span className="strip-note">One independent perspective.</span>
        </section>
        <div className="preview-section shell">
          <div className="section-heading">
            <div>
              <p className="section-eyebrow">LESS GUESSWORK. MORE SIGNAL.</p>
              <h2>See the bigger picture.</h2>
            </div>
            <p>
              Beyond a ranking. Into the answers,
              <br />
              sources, and conversations that matter.
            </p>
          </div>
          <Dashboard />
        </div>
        <section className="features-section shell" id="product">
          <div className="section-heading">
            <div>
              <p className="section-eyebrow">BUILT AROUND YOUR NEXT MOVE</p>
              <h2>
                From “are we there?”
                <br />
                to “here's the opportunity.”
              </h2>
            </div>
            <Badge variant="outline">Planned capabilities</Badge>
          </div>
          <div className="feature-grid">
            {[
              {
                Icon: Compass,
                n: "01",
                title: "Find your place.",
                description:
                  "Follow the questions your customers ask AI. Understand when your brand is mentioned—and when it isn't.",
              },
              {
                Icon: Link2,
                n: "02",
                title: "Connect the dots.",
                description:
                  "Explore cited pages and competing brands. Find the sources that shape the conversation around your market.",
              },
              {
                Icon: Fingerprint,
                n: "03",
                title: "Keep your perspective.",
                description:
                  "Compare answers over time, with your own provider account. A history you can understand and a core you can self-host.",
              },
            ].map(({ Icon, n, title, description }) => (
              <article className="feature" key={n}>
                <div className="feature-top">
                  <span className="feature-icon">
                    <Icon size={21} />
                  </span>
                  <span>{n}</span>
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="principles-section shell" id="principles">
          <div className="principles-box">
            <div>
              <Badge variant="outline" className="principles-badge">
                <ShieldCheck size={13} /> INDEPENDENT BY DESIGN
              </Badge>
              <h2>
                Your data.
                <br />
                Your keys.
                <br />
                <span>Your next move.</span>
              </h2>
            </div>
            <div className="principles-copy">
              <p>Clarity shouldn't come with a lock-in.</p>
              <p>
                We're building an independent AI visibility platform with an
                open-source direction, bring-your-own DataForSEO credentials,
                and a self-hostable core.
              </p>
              <Separator />
              <ul>
                <li>
                  <ShieldCheck size={17} /> Your provider account. Your control.
                </li>
                <li>
                  <Layers3 size={17} /> Self-hostable core. Managed hosting
                  planned.
                </li>
                <li>
                  <ExternalLink size={17} /> Built independently. Designed to be
                  open.
                </li>
              </ul>
              <span className="principles-note">
                Currently in development. Repository private for now.
              </span>
            </div>
          </div>
        </section>
        <section className="closing shell">
          <p className="section-eyebrow">KNOW WHERE YOU STAND.</p>
          <h2>
            Own what comes next<span>.</span>
          </h2>
          <Button asChild size="lg">
            <a href="#preview">
              Take a closer look <ArrowUpRight size={17} />
            </a>
          </Button>
        </section>
      </main>
      <footer className="footer shell">
        <Brand />
        <p>Independent thinking. Clearer signals.</p>
        <span>
          © {new Date().getFullYear()} TrackRank{" "}
          <span className="footer-dot">·</span> In development
        </span>
      </footer>
    </div>
  );
}
