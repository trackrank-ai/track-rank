import { useRef, useState } from "react";
import { Button } from "./ui/button";
import { parseQuestionFile } from "@/lib/prompt-input";

export function QuestionImport({ disabled, onImport }: { disabled: boolean; onImport: (questions: string[]) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const callback = useRef(onImport);
  callback.current = onImport;
  return <div>
    <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => fileInput.current?.click()}>Import TXT or CSV</Button>
    <input ref={fileInput} aria-label="Import questions from TXT or single-column CSV" type="file" accept=".txt,.csv,text/plain,text/csv" hidden disabled={disabled} onChange={async event => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      event.target.value = "";
      if (!file) return;
      try {
        if (file.size > 1_048_576) throw new Error("Choose a file smaller than 1 MB.");
        const questions = parseQuestionFile(await file.text(), file.name);
        if (!input.isConnected) return;
        callback.current(questions);
        setError("");
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to read the file."); }
    }} />
    {error && <p role="alert">{error}</p>}
  </div>;
}
