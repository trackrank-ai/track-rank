import { Link } from "@tanstack/react-router";
import type { AppSearch } from "@/lib/app-location";
import { ExternalLink } from "lucide-react";
import { useId, type ReactNode } from "react";
import "./evidence-report.css";

type EvidenceSource = {
  title?: string | null;
  url?: string | null;
  domain?: string | null;
};

export function EvidenceSources({ sources, illustrative = false, researchLink }: {
  sources: readonly EvidenceSource[];
  illustrative?: boolean;
  researchLink?: (url: string) => AppSearch;
}) {
  if (!sources.length) return <p className="evidence-report-note">{illustrative ? "No example sources." : "The provider returned no citations."}</p>;

  return (
    <ul className="evidence-source-list">
      {sources.map(({ title, url, domain }, index) => {
        const name = title || domain || url || "Untitled source";
        const address = url || domain;
        const content = <>
          <strong>{name}</strong>
          {address && address !== name && <span>{address}</span>}
        </>;
        return (
          <li key={`${url || name}-${index}`}>
            {researchLink && url && /^https?:\/\//i.test(url) ? (
              <div className="evidence-source-actions">
                <span>{content}</span>
                <div>
                  <Link to="/app" search={researchLink(url)}>Research this page</Link>
                  <a href={url} target="_blank" rel="noreferrer">Open original <ExternalLink size={13} aria-hidden="true" /></a>
                </div>
              </div>
            ) : url && /^https?:\/\//i.test(url) ? (
              <a href={url} target="_blank" rel="noreferrer">
                <span>{content}</span>
                <ExternalLink size={16} aria-hidden="true" />
              </a>
            ) : <div>{content}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export function EvidenceReport({
  answer,
  observations,
  sources,
  emptyAnswer = "No AI answer was recorded.",
  className,
  illustrative = false,
  researchLink,
}: {
  answer: string | null;
  observations?: readonly { label: string; value: ReactNode }[];
  sources?: readonly EvidenceSource[];
  emptyAnswer?: ReactNode;
  className?: string;
  illustrative?: boolean;
  researchLink?: (url: string) => AppSearch;
}) {
  const id = useId();
  return (
    <div className={["evidence-report", className].filter(Boolean).join(" ")}>
      <section aria-labelledby={`${id}-answer`}>
        <h3 id={`${id}-answer`}>{illustrative ? "Example answer" : "Recorded answer"}</h3>
        {answer ? <p className="evidence-answer">{answer}</p> : <p className="evidence-report-note">{emptyAnswer}</p>}
      </section>
      {(observations || sources) && (
        <div className="evidence-report-aside">
          {observations && (
            <section aria-labelledby={`${id}-brands`}>
              <h3 id={`${id}-brands`}>Brand observations</h3>
              {observations.length ? (
                <dl className="evidence-observations">
                  {observations.map(({ label, value }, index) => (
                    <div key={`${label}-${index}`}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p className="evidence-report-note">No brand observations were recorded.</p>}
            </section>
          )}
          {sources && (
            <section aria-labelledby={`${id}-sources`}>
              <h3 id={`${id}-sources`}>{illustrative ? "Example sources" : "Sources supplied by the provider"}</h3>
              <EvidenceSources sources={sources} illustrative={illustrative} researchLink={researchLink} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
