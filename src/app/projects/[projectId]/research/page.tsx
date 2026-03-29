'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Search, Loader2 } from 'lucide-react';

export default function ResearchPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState('');
  const [error, setError] = useState('');

  async function handleResearch() {
    setLoading(true);
    setError('');
    setSuggestions('');

    try {
      const res = await fetch('/api/llm/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, query }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuggestions(data.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Research failed');
    }

    setLoading(false);
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
          <CardContent>
            <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">{suggestions}</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
