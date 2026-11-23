import { Check, KeyRound, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const providers = {
  dataforseo: {
    name: "DataForSEO",
    usage: "Used for search and AI tracking across your organization.",
    removal: "This pauses collection schedules across the organization.",
  },
  openrouter: {
    name: "OpenRouter",
    usage: "Optional for model-generated analysis on a collected answer. Visibility, brand mentions, citations and reports work without an OpenRouter key. OpenRouter bills each requested analysis separately.",
    removal: "This removes the saved model and disables new analyses.",
  },
};

export function ProviderCredentialsCard({ provider, configured, model, busy, onSave, onRemove }: {
  provider: keyof typeof providers;
  configured: boolean;
  model?: string;
  busy: boolean;
  onSave: (values: Record<string, FormDataEntryValue>) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const heading = useId();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const { name, usage, removal } = providers[provider];
  const unavailable = busy || pending;

  async function apply(operation: () => Promise<void>, message: string) {
    setPending(true);
    setStatus("");
    setError("");
    try {
      await operation();
      setEditing(false);
      setStatus(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update credentials");
    } finally {
      setPending(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    void apply(() => onSave(values), `${name} credentials saved.`);
  }

  function remove() {
    if (confirm(`Remove ${name} credentials from Trackrank AI? ${removal} To revoke access at the source, manage the credentials in your ${name} account.`)) {
      void apply(onRemove, `${name} credentials removed. ${provider === "dataforseo" ? "Collection schedules paused." : ""}`.trim());
    }
  }

  return (
    <Card role="region" aria-labelledby={heading}>
      <CardContent>
        <div className="panel-title">
          <h2 id={heading}>{name} credentials</h2>
          <Badge variant={configured ? "secondary" : "outline"}>
            {configured && <Check size={12} />} {configured ? "Saved" : "Not set up"}
          </Badge>
        </div>
        <p className="data-note">{usage}</p>
        <p className="data-note">{configured
          ? "Credentials are saved securely in Trackrank AI. Open Replace credentials to enter new ones."
          : `Add credentials from your ${name} account to use this provider.`}</p>
        {configured && provider === "openrouter" && <p className="data-note">Model {model || "not set"}</p>}
        {status && <p className="data-note" role="status">{status}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {editing ? (
          <form className="form-stack" onSubmit={save}>
            <div className="form-grid">
              {provider === "dataforseo" ? <>
                <label className="app-field">
                  <span>DataForSEO API login</span>
                  <input name="login" autoComplete="off" required maxLength={200} autoFocus />
                </label>
                <label className="app-field">
                  <span>DataForSEO API password</span>
                  <input name="password" type="password" autoComplete="new-password" required maxLength={500} />
                </label>
              </> : <>
                <label className="app-field">
                  <span>OpenRouter API key</span>
                  <input name="openrouter_key" type="password" autoComplete="new-password" required maxLength={500} autoFocus />
                </label>
                <label className="app-field">
                  <span>Model identifier</span>
                  <input name="openrouter_model" defaultValue={model} placeholder="provider/model-name" required maxLength={150} />
                </label>
              </>}
            </div>
            <div className="form-actions">
              <Button disabled={unavailable}>{pending ? "Saving…" : `Save ${name} credentials`}</Button>
              <Button type="button" variant="ghost" disabled={unavailable} onClick={() => { setEditing(false); setError(""); }}>Cancel</Button>
            </div>
          </form>
        ) : (
          <div className="form-actions flex-wrap">
            <Button variant={configured ? "outline" : "default"} disabled={unavailable} onClick={() => {
              setStatus("");
              setError("");
              setEditing(true);
            }}>
              <KeyRound size={14} /> {configured ? "Replace credentials" : "Add credentials"}
            </Button>
            {configured && <Button variant="outline" disabled={unavailable} onClick={remove}>
              <Trash2 size={14} /> {pending ? "Removing…" : "Remove credentials"}
            </Button>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
