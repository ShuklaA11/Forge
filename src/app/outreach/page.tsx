'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  Send,
  Sparkles,
  Clock,
  Plus,
  Pause,
  Play,
  Trash2,
  AlertTriangle,
} from 'lucide-react';

type Channel = 'EMAIL' | 'LINKEDIN' | 'PHONE' | 'OTHER';
type SequenceStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'EXHAUSTED';

interface Touchpoint {
  sentAt: string;
}

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string | null;
  email: string | null;
  priorityScore: number;
  currentStage: string;
  status: string;
  projectId: string;
  outreachSequence?: { id: string; status: SequenceStatus } | null;
  project?: { id: string; name: string; color: string };
  touchpoints?: Touchpoint[];
  _count?: { touchpoints: number };
}

interface Sequence {
  id: string;
  leadId: string;
  currentStep: number;
  maxSteps: number;
  intervalDays: number;
  nextTouchDate: string | null;
  status: SequenceStatus;
}

interface DueItem {
  sequence: Sequence;
  lead: Lead;
}

interface Source {
  projectId: string;
  projectName: string;
  docId: string;
  path: string;
  title: string;
  score: number;
}

interface Draft {
  subject: string;
  body: string;
  channel: Channel;
  sources: Source[];
}

const CHANNEL_LABELS: Record<Channel, string> = {
  EMAIL: 'Email',
  LINKEDIN: 'LinkedIn',
  PHONE: 'Phone',
  OTHER: 'Other',
};

export default function OutreachPage() {
  const [due, setDue] = useState<DueItem[]>([]);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeItem, setActiveItem] = useState<DueItem | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [logging, setLogging] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const [pickedLeadId, setPickedLeadId] = useState<string>('');
  const [maxSteps, setMaxSteps] = useState(5);
  const [intervalDays, setIntervalDays] = useState(3);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    const [dueRes, leadsRes] = await Promise.all([
      fetch('/api/sequences').then((r) => r.json()),
      fetch('/api/leads').then((r) => r.json()),
    ]);
    setDue(dueRes);
    setAllLeads(leadsRes);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function openDraft(item: DueItem) {
    setActiveItem(item);
    setDraft(null);
    setDraftError(null);
    setDrafting(true);
    try {
      const res = await fetch(`/api/sequences/${item.sequence.id}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to draft');
      setDraft(data);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Failed to draft');
    } finally {
      setDrafting(false);
    }
  }

  function closeDrawer() {
    setActiveItem(null);
    setDraft(null);
    setDraftError(null);
  }

  async function logTouchpoint() {
    if (!activeItem || !draft) return;
    setLogging(true);
    try {
      const type =
        activeItem.sequence.currentStep === 1 ? 'INITIAL' : 'FOLLOW_UP';
      const res = await fetch('/api/touchpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: activeItem.lead.id,
          channel: draft.channel,
          direction: 'OUTBOUND',
          type,
          subject: draft.subject || null,
          body: draft.body,
          sentAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to log touchpoint');
      }
      closeDrawer();
      await refresh();
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Failed to log');
    } finally {
      setLogging(false);
    }
  }

  async function setStatus(seqId: string, status: SequenceStatus) {
    await fetch(`/api/sequences/${seqId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await refresh();
  }

  async function deleteSequence(seqId: string) {
    if (!confirm('Cancel this sequence?')) return;
    await fetch(`/api/sequences/${seqId}`, { method: 'DELETE' });
    await refresh();
  }

  async function createSequence() {
    if (!pickedLeadId) return;
    setCreating(true);
    try {
      const res = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: pickedLeadId, maxSteps, intervalDays }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create sequence');
      }
      setPickedLeadId('');
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  const overdue = due.filter(
    (d) => d.sequence.nextTouchDate && new Date(d.sequence.nextTouchDate) < startOfToday(),
  );
  const dueToday = due.filter((d) => !overdue.includes(d));
  const eligibleLeads = allLeads.filter((l) => !l.outreachSequence);
  const paused = allLeads.filter((l) => l.outreachSequence?.status === 'PAUSED');

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const activeNoSequence = allLeads.filter(
    (l) =>
      l.status === 'ACTIVE' &&
      !l.outreachSequence &&
      l.currentStage !== 'CLOSED_WON' &&
      l.currentStage !== 'CLOSED_LOST',
  );
  const neverContacted = activeNoSequence
    .filter((l) => (l._count?.touchpoints ?? 0) === 0)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 10);
  const stale = activeNoSequence
    .filter((l) => {
      const lastTouch = l.touchpoints?.[0];
      return lastTouch && new Date(lastTouch.sentAt) < sevenDaysAgo;
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 10);

  if (loading) {
    return <div className="text-muted-foreground">Loading outreach...</div>;
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Outreach Queue</h1>
        <p className="text-sm text-white/40">
          Sequenced follow-ups. Draft with the wiki context, then log what you sent.
        </p>
      </div>

      <Card className={overdue.length > 0 ? 'bg-[#1a1a1a] border-orange-500/40' : 'bg-[#1a1a1a] border-white/[0.06]'}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-white/90">
            <AlertTriangle className="size-4 text-orange-400" />
            Overdue
            <Badge variant="outline" className="ml-1 border-white/15 text-[10px]">{overdue.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {overdue.length === 0 ? (
            <p className="text-sm text-white/40">Nothing overdue.</p>
          ) : (
            overdue.map((item) => (
              <Row key={item.sequence.id} item={item} onDraft={openDraft} onPause={(id) => setStatus(id, 'PAUSED')} onCancel={deleteSequence} />
            ))
          )}
        </CardContent>
      </Card>

      <Card className="bg-[#1a1a1a] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-white/90">
            <Clock className="size-4 text-blue-400" />
            Due today
            <Badge variant="outline" className="ml-1 border-white/15 text-[10px]">{dueToday.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {dueToday.length === 0 ? (
            <p className="text-sm text-white/40">Nothing scheduled for today.</p>
          ) : (
            dueToday.map((item) => (
              <Row key={item.sequence.id} item={item} onDraft={openDraft} onPause={(id) => setStatus(id, 'PAUSED')} onCancel={deleteSequence} />
            ))
          )}
        </CardContent>
      </Card>

      {paused.length > 0 && (
        <Card className="bg-[#1a1a1a] border-white/[0.06]">
          <CardHeader>
            <CardTitle className="text-base text-white/90">Paused</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {paused.map((l) => (
              <div key={l.id} className="flex items-center gap-3 text-sm">
                <span className="text-white/70 flex-1 truncate">
                  {l.firstName} {l.lastName} · {l.company}
                </span>
                <Button size="sm" variant="ghost" onClick={() => l.outreachSequence && setStatus(l.outreachSequence.id, 'ACTIVE')}>
                  <Play className="size-3.5 mr-1.5" />
                  Resume
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {neverContacted.length > 0 && (
        <Card className="bg-[#1a1a1a] border-white/[0.06]">
          <CardHeader>
            <CardTitle className="text-base text-white/90">
              Never contacted
              <Badge variant="outline" className="ml-2 border-white/15 text-[10px]">{neverContacted.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {neverContacted.map((l) => (
              <LeadRow key={l.id} lead={l} onStart={(id) => { setPickedLeadId(id); }} />
            ))}
          </CardContent>
        </Card>
      )}

      {stale.length > 0 && (
        <Card className="bg-[#1a1a1a] border-white/[0.06]">
          <CardHeader>
            <CardTitle className="text-base text-white/90">
              Stale (7+ days, no sequence)
              <Badge variant="outline" className="ml-2 border-white/15 text-[10px]">{stale.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {stale.map((l) => (
              <LeadRow key={l.id} lead={l} onStart={(id) => { setPickedLeadId(id); }} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="bg-[#1a1a1a] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-base text-white/90 flex items-center gap-2">
            <Plus className="size-4" />
            Start a sequence
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Lead</Label>
            <Select value={pickedLeadId} onValueChange={setPickedLeadId}>
              <SelectTrigger className="bg-white/[0.04] border-white/[0.08]">
                <SelectValue
                  placeholder={eligibleLeads.length === 0 ? 'All active leads already have a sequence' : 'Pick a lead'}
                />
              </SelectTrigger>
              <SelectContent>
                {eligibleLeads
                  .sort((a, b) => b.priorityScore - a.priorityScore)
                  .map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.firstName} {l.lastName} · {l.company} (score {l.priorityScore})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max steps</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={maxSteps}
                onChange={(e) => setMaxSteps(Number(e.target.value) || 1)}
                className="bg-white/[0.04] border-white/[0.08]"
              />
            </div>
            <div className="space-y-2">
              <Label>Interval (days)</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={intervalDays}
                onChange={(e) => setIntervalDays(Number(e.target.value) || 1)}
                className="bg-white/[0.04] border-white/[0.08]"
              />
            </div>
          </div>

          <Button onClick={createSequence} disabled={!pickedLeadId || creating} className="bg-indigo-600 hover:bg-indigo-700">
            {creating ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
            Start sequence
          </Button>
        </CardContent>
      </Card>

      <Sheet open={!!activeItem} onOpenChange={(o) => !o && closeDrawer()}>
        <SheetContent className="bg-[#141414] border-white/[0.06] sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-white">
              {activeItem ? `Draft for ${activeItem.lead.firstName} ${activeItem.lead.lastName}` : ''}
            </SheetTitle>
            <SheetDescription>
              {activeItem ? `${activeItem.lead.company} · Step ${activeItem.sequence.currentStep} of ${activeItem.sequence.maxSteps}` : ''}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4 px-4 pb-6">
            {drafting && (
              <div className="flex items-center gap-2 text-sm text-white/50">
                <Loader2 className="size-4 animate-spin" />
                Drafting…
              </div>
            )}
            {draftError && <div className="text-sm text-red-400">Error: {draftError}</div>}

            {draft && (
              <>
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <Select value={draft.channel} onValueChange={(v) => setDraft({ ...draft, channel: v as Channel })}>
                    <SelectTrigger className="bg-white/[0.04] border-white/[0.08]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CHANNEL_LABELS) as Channel[]).map((c) => (
                        <SelectItem key={c} value={c}>{CHANNEL_LABELS[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {draft.channel === 'EMAIL' && (
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Input
                      value={draft.subject}
                      onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                      className="bg-white/[0.04] border-white/[0.08]"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Body</Label>
                  <Textarea
                    value={draft.body}
                    onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                    rows={12}
                    className="bg-white/[0.04] border-white/[0.08] font-mono text-sm"
                  />
                </div>

                {draft.sources.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] uppercase tracking-wider text-white/30">Sources</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {draft.sources.map((s) => (
                        <span key={s.docId} className="text-[11px] px-2 py-0.5 rounded border border-white/10 text-white/50" title={`${s.projectName} · ${s.path}`}>
                          {s.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button onClick={logTouchpoint} disabled={logging || !draft.body.trim()} className="bg-indigo-600 hover:bg-indigo-700">
                    {logging ? <Loader2 className="size-4 animate-spin mr-2" /> : <Send className="size-4 mr-2" />}
                    Log as sent
                  </Button>
                  <Button variant="ghost" onClick={() => activeItem && openDraft(activeItem)} disabled={drafting}>
                    <Sparkles className="size-4 mr-2" />
                    Redraft
                  </Button>
                </div>
                <p className="text-[11px] text-white/30">
                  Logging records the touchpoint and advances the sequence. Send the message yourself in your channel of choice.
                </p>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Row({
  item,
  onDraft,
  onPause,
  onCancel,
}: {
  item: DueItem;
  onDraft: (item: DueItem) => void;
  onPause: (seqId: string) => void;
  onCancel: (seqId: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md px-3 py-2.5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-white/90 truncate text-sm">
            {item.lead.firstName} {item.lead.lastName}
          </span>
          <span className="text-xs text-white/40">·</span>
          <span className="text-xs text-white/50 truncate">
            {item.lead.company}
            {item.lead.title ? ` · ${item.lead.title}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-white/40">
          <span>Step {item.sequence.currentStep}/{item.sequence.maxSteps}</span>
          <span>·</span>
          <span>{item.sequence.nextTouchDate ? new Date(item.sequence.nextTouchDate).toLocaleDateString() : 'now'}</span>
          <span>·</span>
          <span>score {item.lead.priorityScore}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" onClick={() => onDraft(item)}>
          <Sparkles className="size-3.5 mr-1.5" />
          Draft
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-white/40 hover:text-white" onClick={() => onPause(item.sequence.id)} title="Pause">
          <Pause className="size-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-white/40 hover:text-red-400" onClick={() => onCancel(item.sequence.id)} title="Cancel">
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function LeadRow({ lead, onStart }: { lead: Lead; onStart: (leadId: string) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-md px-3 py-2 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white/90 truncate">
          {lead.firstName} {lead.lastName}
          <span className="text-white/40"> · {lead.company}</span>
        </div>
        <div className="text-[11px] text-white/40">
          score {lead.priorityScore}
          {lead.title ? ` · ${lead.title}` : ''}
        </div>
      </div>
      <Button size="sm" variant="ghost" onClick={() => onStart(lead.id)}>
        <Plus className="size-3.5 mr-1.5" />
        Queue
      </Button>
    </div>
  );
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
