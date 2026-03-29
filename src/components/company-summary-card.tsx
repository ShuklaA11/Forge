'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, RefreshCw, Loader2, AlertTriangle, ArrowRightCircle } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils';

interface CompanySummaryCardProps {
  projectId: string;
  companyName: string;
  summary: {
    summary: string;
    insights: string;
    nextSteps: string | null;
    generatedAt: Date;
  } | null;
}

export function CompanySummaryCard({ projectId, companyName, summary }: CompanySummaryCardProps) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);

  async function handleRegenerate() {
    setGenerating(true);
    try {
      const res = await fetch('/api/summaries/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, companyName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate summary');
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-lg">{companyName} Summary</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {summary && (
            <span className="text-xs text-muted-foreground">
              Updated {formatRelativeDate(summary.generatedAt)}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRegenerate}
            disabled={generating}
            className="gap-1.5"
          >
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {generating ? 'Generating...' : summary ? 'Regenerate' : 'Generate'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {summary ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{summary.summary}</p>
            {summary.insights && summary.insights !== 'No significant flags at this time.' && (
              <div className="rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                  <span className="text-sm font-medium">Insights & Flags</span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{summary.insights}</p>
              </div>
            )}
            {summary.insights === 'No significant flags at this time.' && (
              <Badge variant="outline" className="text-xs">No flags</Badge>
            )}
            {summary.nextSteps && (
              <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <ArrowRightCircle className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-sm font-medium">Next Steps</span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{summary.nextSteps}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No summary generated yet. Click &quot;Generate&quot; to create an AI summary of all interactions with {companyName}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
