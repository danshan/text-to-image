import { diffWords } from "../state/prompt-diff";

export function PromptDiff({ before, after }: { before: string; after: string }) {
  const parts = diffWords(before, after);
  return (
    <div className="prompt-diff" aria-label="Prompt revision comparison">
      <div className="diff-legend" aria-hidden="true">
        <span className="diff-key diff-key--deleted">Deletion</span>
        <span className="diff-key diff-key--inserted">Insertion</span>
      </div>
      <pre>
        {parts.map((part, index) => {
          if (part.operation === "equal") return <span key={index}>{part.value}</span>;
          const label = part.operation === "delete" ? "Deletion" : "Insertion";
          return (
            <span className={`diff-part diff-part--${part.operation}`} key={index}>
              <span className="sr-only">{label}: </span>
              {part.value}
            </span>
          );
        })}
      </pre>
    </div>
  );
}
