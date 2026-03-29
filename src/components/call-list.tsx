'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, ChevronRight, MessageSquare, Pencil, Trash2, Save, X, Loader2 } from 'lucide-react';
import { CALL_SENTIMENT_LABELS } from '@/types';
import type { StructuredNotes } from '@/types';
import { formatDate } from '@/lib/utils';

interface CallData {
  id: string;
  title: string;
  callDate: Date;
  durationMinutes: number | null;
  sentiment: string | null;
  sentimentScore: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structuredNotes: any;
  manualNotes: string | null;
  transcript: string | null;
  audioFilePath: string | null;
}

function sentimentColor(sentiment: string | null): string {
  switch (sentiment) {
    case 'VERY_POSITIVE': return 'bg-green-600';
    case 'POSITIVE': return 'bg-green-500';
    case 'NEUTRAL': return 'bg-gray-500';
    case 'NEGATIVE': return 'bg-orange-500';
    case 'VERY_NEGATIVE': return 'bg-red-500';
    default: return 'bg-gray-400';
  }
}

export function CallList({ calls }: { calls: CallData[] }) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editManualNotes, setEditManualNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  function startEditing(call: CallData) {
    const notes = call.structuredNotes as StructuredNotes | null;
    setEditingId(call.id);
    setEditTitle(call.title);
    setEditSummary(notes?.summary || '');
    setEditManualNotes(call.manualNotes || '');
  }

  function cancelEditing() {
    setEditingId(null);
    setEditTitle('');
    setEditSummary('');
    setEditManualNotes('');
  }

  async function saveEdits(call: CallData) {
    setSaving(true);
    try {
      const notes = call.structuredNotes as StructuredNotes | null;
      const updatedNotes = notes ? { ...notes, summary: editSummary } : null;

      await fetch(`/api/calls/${call.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          structuredNotes: updatedNotes,
          manualNotes: editManualNotes || null,
        }),
      });

      cancelEditing();
      router.refresh();
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCall(id: string) {
    if (!confirm('Delete this contact log? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await fetch(`/api/calls/${id}`, { method: 'DELETE' });
      router.refresh();
    } catch (err) {
      console.error('Failed to delete:', err);
    } finally {
      setDeleting(null);
    }
  }

  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <MessageSquare className="h-8 w-8 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No contacts logged yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Use &quot;Log Contact&quot; to upload a recording or enter manual notes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {calls.map((call) => {
        const expanded = expandedId === call.id;
        const isEditing = editingId === call.id;
        const notes = call.structuredNotes as StructuredNotes | null;

        return (
          <Card key={call.id}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  className="flex-1 justify-start p-0 h-auto hover:bg-transparent"
                  onClick={() => setExpandedId(expanded ? null : call.id)}
                >
                  <div className="flex items-center gap-3 w-full">
                    {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{call.title}</span>
                        {call.sentiment && (
                          <Badge className={`text-xs ${sentimentColor(call.sentiment)}`}>
                            {CALL_SENTIMENT_LABELS[call.sentiment] || call.sentiment}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{formatDate(call.callDate)}</span>
                        {call.durationMinutes && <span>· {call.durationMinutes} min</span>}
                        {call.audioFilePath && <span>· Has recording</span>}
                      </div>
                    </div>
                  </div>
                </Button>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); startEditing(call); setExpandedId(call.id); }}
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                    onClick={(e) => { e.stopPropagation(); deleteCall(call.id); }}
                    disabled={deleting === call.id}
                    title="Delete"
                  >
                    {deleting === call.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              {expanded && isEditing && (
                <div className="mt-4 ml-7 space-y-3 border-t pt-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Title</label>
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  </div>

                  {notes && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">AI Summary</label>
                      <Textarea
                        value={editSummary}
                        onChange={(e) => setEditSummary(e.target.value)}
                        rows={4}
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Manual Notes</label>
                    <Textarea
                      value={editManualNotes}
                      onChange={(e) => setEditManualNotes(e.target.value)}
                      rows={3}
                      placeholder="Add notes..."
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdits(call)} disabled={saving} className="gap-1.5">
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={cancelEditing} className="gap-1.5">
                      <X className="h-3.5 w-3.5" /> Cancel
                    </Button>
                  </div>
                </div>
              )}

              {expanded && !isEditing && notes && (
                <div className="mt-4 ml-7 space-y-3 border-t pt-3">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Summary</h4>
                    <p className="text-sm text-muted-foreground">{notes.summary}</p>
                  </div>

                  {notes.keyPoints?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Key Points</h4>
                      <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-0.5">
                        {notes.keyPoints.map((p, i) => <li key={i}>{p}</li>)}
                      </ul>
                    </div>
                  )}

                  {notes.objections?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Objections</h4>
                      <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-0.5">
                        {notes.objections.map((o, i) => <li key={i}>{o}</li>)}
                      </ul>
                    </div>
                  )}

                  {notes.validationSignals?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Validation Signals</h4>
                      <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-0.5">
                        {notes.validationSignals.map((v, i) => <li key={i}>{v}</li>)}
                      </ul>
                    </div>
                  )}

                  {notes.commitments?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Commitments</h4>
                      <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-0.5">
                        {notes.commitments.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  )}

                  {notes.nextSteps?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Next Steps</h4>
                      <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-0.5">
                        {notes.nextSteps.map((n, i) => <li key={i}>{n}</li>)}
                      </ul>
                    </div>
                  )}

                  {notes.quotes?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Key Quotes</h4>
                      <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-0.5">
                        {notes.quotes.map((q, i) => <li key={i}>&ldquo;{q}&rdquo;</li>)}
                      </ul>
                    </div>
                  )}

                  {call.manualNotes && !call.transcript && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Manual Notes</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{call.manualNotes}</p>
                    </div>
                  )}
                </div>
              )}

              {expanded && !isEditing && !notes && call.manualNotes && (
                <div className="mt-4 ml-7 border-t pt-3">
                  <h4 className="text-sm font-medium mb-1">Manual Notes</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{call.manualNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
