import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MAX_PROMPT_TAGS, MAX_PROMPT_TAG_LENGTH, splitPromptTags } from "@/lib/prompt-tags";

export type PromptSettings = {
  mode?: string;
  location_name?: string;
  language_code?: string;
  brand_id?: string | null;
  tags?: string[];
};

type Props = {
  engines: string;
  busy: boolean;
  current?: PromptSettings;
  brands?: { id: string; name: string }[];
  request: (path: string) => Promise<Record<string, any>>;
  save: (changes: PromptSettings) => Promise<void>;
};

export function PromptSettingsEditor(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <details className="advanced-settings" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>{props.current ? "Edit engine settings" : "Edit selected engine settings"}</summary>
      {open && <SettingsForm {...props} />}
    </details>
  );
}

function SettingsForm({ engines, busy, current, brands, request, save }: Props) {
  const [mode, setMode] = useState(current?.mode ?? "");
  const [location, setLocation] = useState(current?.location_name ?? "");
  const [language, setLanguage] = useState(current?.language_code ?? "");
  const [brand, setBrand] = useState(current?.brand_id ?? "");
  const [tags, setTags] = useState(current?.tags?.join(", ") ?? "");
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<{ locations: string[]; languages: { code: string; name: string }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ engines, q: query, selected_location: location });
      request("/provider/options?" + params)
        .then(data => {
          if (active) setChoices({ locations: data.locations, languages: data.languages });
        })
        .catch(() => {
          if (active) setError("Supported locations and languages could not load. Reopen the editor to retry.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [engines, query, location, request]);

  const changes: PromptSettings = {};
  if (mode && mode !== current?.mode) changes.mode = mode;
  if (location && location !== current?.location_name) changes.location_name = location;
  if (language && language !== current?.language_code) changes.language_code = language;
  if (current && brand !== (current.brand_id ?? "")) changes.brand_id = brand || null;
  if (current && tags !== (current.tags?.join(", ") ?? "")) changes.tags = splitPromptTags(tags);
  const disabled = busy || !Object.keys(changes).length
    || (!!changes.location_name && (loading || !!error || !choices?.locations.includes(location)))
    || (!!changes.language_code && (loading || !!error || !choices?.languages.some(option => option.code === language)));

  return (
    <form className="form-stack" onSubmit={event => {
      event.preventDefault();
      if (!disabled) void save(changes);
    }}>
      <div className="form-grid">
        <label className="app-field">
          <span>Execution mode</span>
          <select value={mode} onChange={event => setMode(event.target.value)} disabled={busy}>
            {!current && <option value="">Keep current mode</option>}
            <option value="standard">Standard queue</option>
            <option value="priority">Priority queue</option>
            <option value="live">Live</option>
          </select>
          <small>Priority and live may cost more on future runs.</small>
        </label>
        <label className="app-field">
          <span>Search supported locations</span>
          <input type="search" value={query} onChange={event => setQuery(event.target.value)}
            placeholder="Search country or city…" maxLength={100} disabled={busy} />
        </label>
        <label className="app-field">
          <span>Location</span>
          <select value={location} onChange={event => setLocation(event.target.value)} disabled={busy || loading || !!error}>
            {!current && <option value="">Keep current locations</option>}
            {location && !choices?.locations.includes(location) && <option value={location}>{location}</option>}
            {choices?.locations.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="app-field">
          <span>Language</span>
          <select value={language} onChange={event => setLanguage(event.target.value)} disabled={busy || loading || !!error}>
            {!current && <option value="">Keep current languages</option>}
            {language && !choices?.languages.some(option => option.code === language) && <option value={language}>{language}</option>}
            {choices?.languages.map(option => <option key={option.code} value={option.code}>{option.name} ({option.code})</option>)}
          </select>
        </label>
        {current && <>
          <label className="app-field">
            <span>Associated brand (optional)</span>
            <select value={brand} onChange={event => setBrand(event.target.value)} disabled={busy}>
              <option value="">No associated brand</option>
              {current.brand_id && !brands?.some(option => option.id === current.brand_id) &&
                <option value={current.brand_id}>Current brand</option>}
              {brands?.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
          <label className="app-field">
            <span>Tags (optional)</span>
            <input value={tags} onChange={event => setTags(event.target.value)} disabled={busy}
              maxLength={MAX_PROMPT_TAGS * (MAX_PROMPT_TAG_LENGTH + 2)} />
            <small>Separate tags with commas.</small>
          </label>
        </>}
      </div>
      {loading && <p className="data-note" role="status">Loading supported locations and languages…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {choices && !loading && !error && !choices.locations.length &&
        <p className="data-note">No supported locations match this search.</p>}
      <div className="form-actions">
        <Button disabled={disabled}>{current ? "Save engine settings" : "Apply selected settings"}</Button>
      </div>
    </form>
  );
}
