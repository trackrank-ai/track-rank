import { useRef, useState } from "react";
import { parseQuestionFile } from "@/lib/prompt-input";

export function QuestionImport({ onImport }: { onImport: (questions: string[]) => void }) {
  const [error, setError] = useState("");
  const callback = useRef(onImport);
  callback.current = onImport;
  return <div>
    <label className="small-link question-import-link">
      Import TXT or CSV
      <input type="file" accept=".txt,.csv,text/plain,text/csv" className="sr-only" onChange={async event => {
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
    </label>
    {error && <p role="alert">{error}</p>}
  </div>;
}
