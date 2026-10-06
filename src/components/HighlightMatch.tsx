import { useMemo } from 'react';
import { stripDiacritics } from '../utils/format';

// Destaca o trecho do texto que corresponde à busca (ignora maiúsculas e acentos)
export function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = useMemo(() => stripDiacritics(query.trim().toLowerCase()), [query]);
  const comp = useMemo(() => {
    if (!q || !text) return null;
    const comp: { ch: string; idx: number }[] = [];
    for (let i = 0; i < text.length; i++) {
      const base = stripDiacritics(text[i].toLowerCase());
      for (const b of base) comp.push({ ch: b, idx: i });
    }
    return comp;
  }, [text, q]);

  if (!q || !text || !comp) return <>{text}</>;
  const start = comp.map(c => c.ch).join('').indexOf(q);
  if (start === -1) return <>{text}</>;
  const end = start + q.length;
  const textStart = comp[start].idx;
  const textEnd = comp[end - 1].idx + 1;
  return (
    <>
      {text.slice(0, textStart)}
      <mark className="ui-search-highlight font-semibold rounded-sm px-0.5">{text.slice(textStart, textEnd)}</mark>
      {text.slice(textEnd)}
    </>
  );
}
