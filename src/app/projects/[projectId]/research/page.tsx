'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Search, Loader2, Sparkles, Check, X, ExternalLink } from 'lucide-react';

interface Candidate {
  company: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  linkedinUrl?: string;
  sourceUrls: string[];
  rationale: string;
}

export default function ResearchPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState('');
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [converted, setConverted] = useState<Set<number>>(new Set());
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [convertingIdx, setConvertingIdx] = useState<number | null>(null);

  async function handleResearch() {
    setLoading(true);
    setError('');
    setSuggestions('');
    setSessionId(null);
    setCandidates([]);
    setConverted(new Set());
    setDismissed(new Set());
    setDiscoverError('');

    try {
      const res = await fetch('/api/llm/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, query }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuggestions(data.suggestions);
      setSessionId(data.session?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Research failed');
    }

    setLoading(false);
  }

  async function handleDiscover() {
    if (!sessionId) return;
    setDiscovering(true);
    setDiscoverError('');
    try {
      const res = await fetch(`/api/llm/research/${sessionId}/discover`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCandidates(data.candidates ?? []);
      setConverted(new Set());
      setDismissed(new Set());
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : 'Discovery failed');
    }
    setDiscovering(false);
  }

  async function handleConvert(idx: number, c: Candidate) {
    setConvertingIdx(idx);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          firstName: c.firstName ?? '',
          lastName: c.lastName ?? '',
          company: c.company,
          title: c.title,
          linkedinUrl: c.linkedinUrl,
          source: 'AI_RESEARCH',
          notes: c.rationale,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Convert failed');
      setConverted((s) => new Set(s).add(idx));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Convert failed');
    }
    setConvertingIdx(null);
  }

  function handleDismiss(idx: number) {
    setDismissed((s) => new Set(s).add(idx));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Lead Finder</h1>
        <p className="text-muted-foreground">Describe the type of leads you are looking for and get AI-powered research strategies</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">New Research</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g., CFOs at community banks in Texas with 50-200 employees who might need treasury management solutions" rows={3} />
          <Button onClick={handleResearch} disabled={loading || !query.trim()}>
            {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Researching...</>) : (<><Search className="mr-2 h-4 w-4" /> Find Leads</>)}
          </Button>
        </CardContent>
      </Card>

      {error && <Card className="border-red-500"><CardContent className="pt-6 text-red-500">{error}</CardContent></Card>}

      {suggestions && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Research Results</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">{suggestions}</div>
            {sessionId && (
              <div className="pt-2 border-t">
                <Button onClick={handleDiscover} disabled={discovering}>
                  {discovering ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching the web...</>) : (<><Sparkles className="mr-2 h-4 w-4" /> Run discovery</>)}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">Searches the web using the strategy above and extracts concrete lead candidates with source URLs.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {discoverError && <Card className="border-red-500"><CardContent className="pt-6 text-red-500">{discoverError}</CardContent></Card>}

      {candidates.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Candidates ({candidates.length - dismissed.size})</h2>
          {candidates.map((c, idx) => {
            if (dismissed.has(idx)) return null;
            const isConverted = converted.has(idx);
            const isConverting = convertingIdx === idx;
            return (
              <Card key={idx}>
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="font-semibold">{c.company}</div>
                      {(c.firstName || c.lastName || c.title) && (
                        <div className="text-sm">
                          {[c.firstName, c.lastName].filter(Boolean).join(' ')}
                          {c.title && <span className="text-muted-foreground"> — {c.title}</span>}
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground">{c.rationale}</p>
                      {c.sourceUrls.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {c.sourceUrls.map((u) => (
                            <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded bg-muted hover:bg-muted/80">
                              <ExternalLink className="h-3 w-3" />
                              {new URL(u).hostname}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      {isConverted ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 px-2 py-1">
                          <Check className="h-3 w-3" /> Converted
                        </span>
                      ) : (
                        <>
                          <Button size="sm" onClick={() => handleConvert(idx, c)} disabled={isConverting}>
                            {isConverting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Convert'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDismiss(idx)}>
                            <X className="h-3 w-3 mr-1" /> Dismiss
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
