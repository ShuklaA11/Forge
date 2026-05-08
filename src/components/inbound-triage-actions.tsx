'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Loader2, MessageSquare, PauseCircle, RefreshCw, Copy, Check, Sparkles } from 'lucide-react';
import { parseTriageOutput, type TriageIntent, type TriageResult } from '@/lib/agents/reply-triage';

interface InboundTriageActionsProps {
  touchpointId: string;
  aiTriage: unknown;
  sequenceId?: string;
}

const INTENT_BADGE: Record<TriageIntent, { label: string; className: string }> = {
  interested: { label: 'Interested', className: 'bg-green-600 hover:bg-green-600 text-white' },
  objection: { label: 'Objection', className: 'bg-amber-600 hover:bg-amber-600 text-white' },
  schedule_meeting: { label: 'Schedule meeting', className: 'bg-blue-600 hover:bg-blue-600 text-white' },
  unsubscribe: { label: 'Unsubscribe', className: 'bg-red-600 hover:bg-red-600 text-white' },
  other: { label: 'Other', className: 'bg-gray-500 hover:bg-gray-500 text-white' },
};

export function InboundTriageActions({ touchpointId, aiTriage, sequenceId }: InboundTriageActionsProps) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function runTriage() {
    setRunning(true);
    try {
      const res = await fetch(`/api/touchpoints/${touchpointId}/triage`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Triage failed');
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Triage failed');
    }
    setRunning(false);
  }

  async function pauseSequence() {
    if (!sequenceId) return;
    if (!confirm('Pause this lead\'s active outreach sequence?')) return;
    setPausing(true);
    try {
      const res = await fetch(`/api/sequences/${sequenceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PAUSED' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Pause failed');
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Pause failed');
    }
    setPausing(false);
  }

  if (!aiTriage) {
    return (
      <div className="flex items-center gap-2 text-xs mt-1">
        <span className="text-muted-foreground italic">AI triage not yet run.</span>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={runTriage} disabled={running}>
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Sparkles className="h-3 w-3 mr-1" /> Run triage</>}
        </Button>
      </div>
    );
  }

  const parsed = parseTriageOutput(aiTriage);
  if (!parsed.ok) {
    return (
      <div className="flex items-center gap-2 text-xs mt-1">
        <span className="text-muted-foreground italic">Triage data invalid — re-run.</span>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={runTriage} disabled={running}>
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RefreshCw className="h-3 w-3 mr-1" /> Re-triage</>}
        </Button>
      </div>
    );
  }

  const triage: TriageResult = parsed.value;
  const intentMeta = INTENT_BADGE[triage.intent];
  const showPause = triage.intent === 'unsubscribe' && !!sequenceId;
  const showDraft = !!triage.draftReply;

  async function copyDraft() {
    if (!triage.draftReply) return;
    await navigator.clipboard.writeText(triage.draftReply);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-2 space-y-2 rounded border-l-2 border-primary/30 pl-3 py-2 bg-muted/30">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge className={`text-xs ${intentMeta.className}`}>{intentMeta.label}</Badge>
        <span className="text-xs text-muted-foreground">{Math.round(triage.confidence * 100)}% confident</span>
      </div>
      <p className="text-sm">{triage.summary}</p>
      <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Suggested:</span> {triage.suggestedAction}</p>
      <div className="flex items-center gap-2 flex-wrap">
        {showDraft && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDraftOpen(true)}>
            <MessageSquare className="h-3 w-3 mr-1" /> Draft reply
          </Button>
        )}
        {showPause && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={pauseSequence} disabled={pausing}>
            {pausing ? <Loader2 className="h-3 w-3 animate-spin" /> : <><PauseCircle className="h-3 w-3 mr-1" /> Pause sequence</>}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={runTriage} disabled={running}>
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RefreshCw className="h-3 w-3 mr-1" /> Re-triage</>}
        </Button>
      </div>

      <Sheet open={draftOpen} onOpenChange={setDraftOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Suggested reply</SheetTitle>
            <SheetDescription>Copy this draft and paste it into your reply. Edit as needed.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3 px-4">
            <pre className="text-sm whitespace-pre-wrap rounded border bg-muted/40 p-3">{triage.draftReply}</pre>
            <Button onClick={copyDraft} size="sm">
              {copied ? <><Check className="h-3 w-3 mr-1" /> Copied</> : <><Copy className="h-3 w-3 mr-1" /> Copy to clipboard</>}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
