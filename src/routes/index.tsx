import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

const capabilities = [
  [
    "01",
    "Follow the conversation",
    "Track the questions your customers ask AI, and see when your brand appears.",
  ],
  [
    "02",
    "Find the sources",
    "Explore the pages AI cites and the competitors showing up beside you.",
  ],
  [
    "03",
    "Own your history",
    "Compare answers over time. Keep your data, your provider account, and your options.",
  ],
];

function Home() {
  return (
    <div className="site">
      <header className="header">
        <a className="brand" href="/" aria-label="TrackRank home">
          <span className="mark" aria-hidden="true">
            ↗
          </span>
          trackrank<span className="ai">.ai</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#product">Product</a>
          <a href="#principles">Our approach</a>
          <a className="nav-cta" href="#preview">
            Explore the preview ↗
          </a>
        </nav>
      </header>
      <main>
        <section className="hero">
          <div className="eyebrow">
            <span className="dot" /> INDEPENDENT BY DESIGN · IN DEVELOPMENT
          </div>
          <h1>
            When AI answers,
            <br />
            does your brand <em>show up?</em>
          </h1>
          <p className="intro">
            See where your brand is mentioned, which sources get cited, and who
            gets recommended instead. AI visibility tracking built to be yours.
          </p>
          <div className="actions">
            <a className="button" href="#preview">
              Explore the product direction <span>↗</span>
            </a>
            <a className="text-link" href="#principles">
              Your keys. Your data. Your choice.
            </a>
          </div>
          <p className="availability">
            Early development preview. Signup and live tracking are not
            available yet.
          </p>
        </section>
        <section
          className="preview"
          id="preview"
          aria-labelledby="preview-title"
        >
          <div className="preview-top">
            <div>
              <span className="workspace-dot" /> Example workspace{" "}
              <span className="slash">/</span> Overview
            </div>
            <span className="sample">ILLUSTRATIVE DATA</span>
          </div>
          <div className="preview-heading">
            <div>
              <p className="overline">AI VISIBILITY</p>
              <h2 id="preview-title">A clearer picture of your presence.</h2>
            </div>
            <span className="period">Example reporting period</span>
          </div>
          <div className="metrics">
            <article>
              <p>Brand mention rate</p>
              <strong>
                42<span>%</span>
              </strong>
              <small>42 of 100 successful answers</small>
            </article>
            <article>
              <p>Website citation rate</p>
              <strong>
                28<span>%</span>
              </strong>
              <small>28 of 100 successful answers</small>
            </article>
            <article>
              <p>Tracked prompts</p>
              <strong>25</strong>
              <small>Questions worth following</small>
            </article>
          </div>
          <div className="answer">
            <span className="answer-label">EXAMPLE PROMPT</span>
            <h3>What are the best tools for my team?</h3>
            <p>
              Read the actual answer. See the brands mentioned and the sources
              cited. Understand the context behind the numbers.
            </p>
            <div className="tags">
              <span>Brand mentions</span>
              <span>Cited sources</span>
              <span>Answer history</span>
            </div>
          </div>
          <p className="preview-note">
            Static concept preview — these numbers are examples, not collected
            results.
          </p>
        </section>
        <section
          className="features"
          id="product"
          aria-label="Planned capabilities"
        >
          {capabilities.map(([number, title, description]) => (
            <article key={number}>
              <span className="number">{number}</span>
              <h2>{title}</h2>
              <p>{description}</p>
            </article>
          ))}
        </section>
        <section className="principles" id="principles">
          <p className="overline">BUILT ON A SIMPLE BELIEF</p>
          <h2>
            Your visibility data shouldn't
            <br />
            come with a lock-in.
          </h2>
          <p>
            We're building TrackRank as a standalone open-source project, with
            bring-your-own DataForSEO credentials and a self-hostable core.
            Managed hosting is planned for teams who prefer not to run
            infrastructure.
          </p>
          <div className="principle-tags">
            <span>Open-source direction</span>
            <span>Bring your own API account</span>
            <span>Self-hostable core</span>
          </div>
        </section>
      </main>
      <footer>
        <a className="brand" href="/">
          trackrank<span className="ai">.ai</span>
        </a>
        <p>Know where you stand. Own what comes next.</p>
        <span>In development · © {new Date().getFullYear()} TrackRank</span>
      </footer>
    </div>
  );
}
