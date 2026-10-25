import type { ReactNode } from 'react';

// Renders the agreement texts in content/legal: headings, paragraphs, lists,
// quotes, tables, and **bold**. Deliberately small; the texts use nothing else.

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    if (line.startsWith('# ')) blocks.push(<h1 key={i}>{inline(line.slice(2))}</h1>);
    else if (line.startsWith('## ')) blocks.push(<h2 key={i}>{inline(line.slice(3))}</h2>);
    else if (line.startsWith('> ')) blocks.push(<blockquote key={i}>{inline(line.slice(2))}</blockquote>);
    else if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('- ')) items.push(lines[i++]!.slice(2));
      i--;
      blocks.push(
        <ul key={i}>
          {items.map((item, j) => (
            <li key={j}>{inline(item)}</li>
          ))}
        </ul>,
      );
    } else if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.startsWith('|')) {
        const cells = lines[i++]!.split('|').slice(1, -1).map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
      }
      i--;
      const [head, ...body] = rows;
      blocks.push(
        <table key={i}>
          <thead>
            <tr>{head!.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((r, k) => (
              <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>
            ))}
          </tbody>
        </table>,
      );
    } else blocks.push(<p key={i}>{inline(line)}</p>);
  }
  return <>{blocks}</>;
}
