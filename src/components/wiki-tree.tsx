'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { WikiDocumentKind } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';

export interface WikiTreeDoc {
  path: string;
  kind: WikiDocumentKind;
  title: string;
}

interface WikiTreeProps {
  projectId: string;
  docs: WikiTreeDoc[];
  currentPath?: string;
}

const GROUPS: Array<{ kind: WikiDocumentKind; label: string }> = [
  { kind: 'PROJECT_INDEX', label: 'Project' },
  { kind: 'COMPANY', label: 'Companies' },
  { kind: 'PERSON', label: 'People' },
  { kind: 'CALL', label: 'Calls' },
  { kind: 'TOPIC', label: 'Topics' },
];

export function WikiTree({ projectId, docs, currentPath }: WikiTreeProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const grouped = GROUPS.map((g) => ({
    ...g,
    items: docs
      .filter((d) => d.kind === g.kind)
      .sort((a, b) => a.title.localeCompare(b.title)),
  }));

  const toggle = (kind: string) =>
    setCollapsed((prev) => ({ ...prev, [kind]: !prev[kind] }));

  return (
    <nav className="space-y-3 text-sm">
      {grouped.map((g) => {
        const isCollapsed = collapsed[g.kind];
        return (
          <div key={g.kind}>
            <button
              type="button"
              onClick={() => toggle(g.kind)}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left font-medium hover:bg-muted"
            >
              <span className="flex items-center gap-1">
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {g.label}
              </span>
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {g.items.length}
              </Badge>
            </button>
            {!isCollapsed && g.items.length > 0 && (
              <ul className="mt-1 space-y-0.5 pl-5">
                {g.items.map((doc) => {
                  const isActive = doc.path === currentPath;
                  return (
                    <li key={doc.path}>
                      <Link
                        href={`/projects/${projectId}/wiki/${doc.path}`}
                        className={`block truncate rounded px-2 py-1 text-xs hover:bg-muted ${
                          isActive ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'
                        }`}
                        title={doc.title}
                      >
                        {doc.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {!isCollapsed && g.items.length === 0 && (
              <p className="pl-5 pt-1 text-xs text-muted-foreground">_empty_</p>
            )}
          </div>
        );
      })}
    </nav>
  );
}

interface RecompileButtonProps {
  projectId: string;
}

export function RecompileButton({ projectId }: RecompileButtonProps) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/wiki/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, scope: { kind: 'all' } }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button onClick={handleClick} disabled={running} size="sm" variant="outline">
        <RefreshCw className={`mr-2 h-3 w-3 ${running ? 'animate-spin' : ''}`} />
        {running ? 'Recompiling…' : 'Recompile wiki'}
      </Button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}

interface WikiMarkdownProps {
  projectId: string;
  content: string;
}

// Rewrite [[wiki/path.md]] and [[wiki/path.md|label]] into standard markdown
// links pointing at /projects/<projectId>/wiki/<path>. Done before handing the
// content to react-markdown so [[...]] backlinks become real <a> tags.
function rewriteWikiBacklinks(content: string, projectId: string): string {
  return content.replace(/\[\[([^\]]+)\]\]/g, (_match, inner: string) => {
    const [target, label] = inner.split('|').map((s) => s.trim());
    if (!target) return _match;
    const display = label || target;
    return `[${display}](/projects/${projectId}/wiki/${target})`;
  });
}

export function WikiMarkdown({ projectId, content }: WikiMarkdownProps) {
  const rewritten = rewriteWikiBacklinks(content, projectId);
  return (
    <article className="prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{rewritten}</ReactMarkdown>
    </article>
  );
}
