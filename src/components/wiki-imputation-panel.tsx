'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search } from 'lucide-react';

export type ImputationSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ImputationProposalRow {
  id: string;
  severity: ImputationSeverity;
  title: string;
  description: string;
  evidence: Array<{
    field?: string;
    value?: string;
    confidence?: ImputationSeverity;
    sourceUrl?: string;
    quote?: string;
  }>;
}

interface Props {
  projectId: string;
  companyName: string;
  proposals: ImputationProposalRow[];
}

const SEVERITY_BADGE: Record<ImputationSeverity, 'default' | 'secondary' | 'destructive'> = {
  LOW: 'secondary',
  MEDIUM: 'default',
  HIGH: 'destructive',
};

export function WikiImputationPanel({ projectId, companyName, proposals }: Props) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  async function handleRun() {
    setRunning(true);
    try {
      const res = await fetch('/api/wiki/imputation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, kind: 'company', companyName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Imputation failed');
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Imputation failed');
    } finally {
      setRunning(false);
    }
  }

  async function updateStatus(id: string, status: 'DISMISSED' | 'RESOLVED' | 'APPLIED') {
    setPendingId(id);
    setHidden((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    try {
      const res = await fetch(`/api/wiki/imputation/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Update failed');
      }
      router.refresh();
    } catch (err) {
      // Roll back optimistic hide on failure
      setHidden((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      alert(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setPendingId(null);
    }
  }

  const visible = proposals.filter((p) => !hidden.has(p.id));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">
          Missing facts ({visible.length})
        </CardTitle>
        <Button size="sm" variant="outline" onClick={handleRun} disabled={running}>
          {running ? (
            <>
              <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Running…
            </>
          ) : (
            <>
              <Search className="mr-2 h-3 w-3" /> Run imputation
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No open proposals. Click <strong>Run imputation</strong> to search the
            web for missing facts on this company.
          </p>
        ) : (
          <ul className="space-y-3">
            {visible.map((p) => {
              const ev = p.evidence[0] ?? {};
              return (
                <li key={p.id} className="rounded border p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{ev.field ?? p.title}</span>
                        <Badge variant={SEVERITY_BADGE[p.severity]}>
                          {p.severity.toLowerCase()}
                        </Badge>
                      </div>
                      <p className="mt-1 font-medium">{ev.value ?? '—'}</p>
                      {ev.quote && (
                        <p className="mt-1 italic text-muted-foreground">
                          “{ev.quote}”
                        </p>
                      )}
                      {ev.sourceUrl && (
                        <a
                          href={ev.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block break-all font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {ev.sourceUrl}
                        </a>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={pendingId === p.id}
                        onClick={() => updateStatus(p.id, 'APPLIED')}
                      >
                        Apply to wiki
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pendingId === p.id}
                        onClick={() => updateStatus(p.id, 'RESOLVED')}
                      >
                        Mark resolved
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pendingId === p.id}
                        onClick={() => updateStatus(p.id, 'DISMISSED')}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
