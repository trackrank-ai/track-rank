export type BrandPassage = { brand_id: string; name: string; before: string; match: string; after: string };

export function AnswerPreview({ excerpt, passage }: { excerpt?: string | null; passage?: BrandPassage | null }) {
  if (!excerpt && !passage) return null;
  return <div className="answer-preview">
    {excerpt && <p className="answer-excerpt">{excerpt}</p>}
    {passage && <div className="preview-passage"><strong>Mention of {passage.name}</strong>
      <p>{passage.before}<mark>{passage.match}</mark>{passage.after}</p>
    </div>}
  </div>;
}
