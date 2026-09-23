import React from 'react';

function renderInline(text, keyPrefix) {
  const nodes = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      nodes.push(<code key={key} className="px-1 rounded bg-base-300/60 text-[0.85em]">{token.slice(1, -1)}</code>);
    } else if (token.startsWith('[')) {
      const mm = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (mm) {
        const href = /^(https?:|\/|#)/i.test(mm[2]) ? mm[2] : '#';
        nodes.push(<a key={key} href={href} target="_blank" rel="noopener noreferrer" className="link link-primary">{mm[1]}</a>);
      } else {
        nodes.push(token);
      }
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export default function MarkdownText({ text }) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let list = null;

  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={`l-${blocks.length}`} className={list.ordered ? 'list-decimal pl-5 space-y-0.5' : 'list-disc pl-5 space-y-0.5'}>
        {list.items.map((it, i) => <li key={i}>{renderInline(it, `li-${blocks.length}-${i}`)}</li>)}
      </Tag>
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { flushList(); continue; }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const cls = level <= 2 ? 'font-bold text-[0.95rem] mt-1' : 'font-semibold text-[0.9rem] mt-1';
      blocks.push(<p key={`h-${blocks.length}`} className={cls}>{renderInline(heading[2], `h-${blocks.length}`)}</p>);
      continue;
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; }
      list.items.push(ol[1]);
      continue;
    }
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ul) {
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; }
      list.items.push(ul[1]);
      continue;
    }
    flushList();
    blocks.push(<p key={`p-${blocks.length}`} className="whitespace-pre-wrap">{renderInline(line, `p-${blocks.length}`)}</p>);
  }
  flushList();

  return <div className="space-y-1.5 text-sm">{blocks}</div>;
}
