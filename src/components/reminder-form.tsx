'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Bell, Plus, Check, Trash2, Loader2, X, Sparkles } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { formatDate } from '@/lib/utils';
import type { MeetingPrepBrief } from '@/lib/agents/meeting-prep';

interface ReminderData {
  id: string;
  title: string;
  notes: string | null;
  dueDate: Date;
  completed: boolean;
  aiPrepBrief: string | null;
}

interface PrepSource {
  title: string;
  url: string;
  snippet: string;
}

export function ReminderSection({ leadId, reminders }: { leadId: string; reminders: ReminderData[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [prepReminderId, setPrepReminderId] = useState<string | null>(null);
  const [prepLoading, setPrepLoading] = useState(false);
  const [prepBrief, setPrepBrief] = useState<MeetingPrepBrief | null>(null);
  const [prepSources, setPrepSources] = useState<PrepSource[]>([]);
  const [prepError, setPrepError] = useState<string | null>(null);

  function openPrep(reminder: ReminderData) {
    setPrepReminderId(reminder.id);
    setPrepError(null);
    setPrepSources([]);
    if (reminder.aiPrepBrief) {
      try {
        setPrepBrief(JSON.parse(reminder.aiPrepBrief) as MeetingPrepBrief);
      } catch {
        setPrepBrief(null);
      }
    } else {
      setPrepBrief(null);
    }
  }

  function closePrep() {
    setPrepReminderId(null);
    setPrepBrief(null);
    setPrepSources([]);
    setPrepError(null);
  }

  async function generatePrep(reminderId: string) {
    setPrepLoading(true);
    setPrepError(null);
    try {
      const res = await fetch(`/api/reminders/${reminderId}/prep`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate prep');
      }
      const data = await res.json();
      setPrepBrief(data.brief as MeetingPrepBrief);
      setPrepSources((data.sources as PrepSource[]) || []);
      router.refresh();
    } catch (err) {
      setPrepError(err instanceof Error ? err.message : 'Failed to generate prep');
    } finally {
      setPrepLoading(false);
    }
  }

  async function handleCreate() {
    if (!title || !dueDate) return;
    setSaving(true);
    try {
      await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, title, notes: notes || null, dueDate }),
      });
      setTitle('');
      setNotes('');
      setDueDate('');
      setShowForm(false);
      router.refresh();
    } catch (err) {
      console.error('Failed to create reminder:', err);
    } finally {
      setSaving(false);
    }
  }

  async function toggleComplete(id: string, completed: boolean) {
    setTogglingId(id);
    try {
      await fetch(`/api/reminders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !completed }),
      });
      router.refresh();
    } catch (err) {
      console.error('Failed to toggle reminder:', err);
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
      router.refresh();
    } catch (err) {
      console.error('Failed to delete reminder:', err);
    } finally {
      setDeletingId(null);
    }
  }

  const now = new Date();
  const pending = reminders.filter((r) => !r.completed);
  const completed = reminders.filter((r) => r.completed);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-lg">Reminders</CardTitle>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowForm(!showForm)} className="gap-1.5">
          {showForm ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {showForm ? 'Cancel' : 'Add'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <div className="space-y-2 border rounded-md p-3">
            <Input
              placeholder="Follow up about pricing..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="flex gap-2">
              <Input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="flex-1"
              />
            </div>
            <Textarea
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
            <Button size="sm" onClick={handleCreate} disabled={saving || !title || !dueDate} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add Reminder
            </Button>
          </div>
        )}

        {pending.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground">No reminders set. Click &quot;Add&quot; to create one.</p>
        )}

        {pending.map((r) => {
          const isOverdue = new Date(r.dueDate) < now;
          return (
            <div key={r.id} className={`flex items-start gap-2 p-2 rounded-md border ${isOverdue ? 'border-red-500/30 bg-red-500/5' : ''}`}>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 mt-0.5"
                onClick={() => toggleComplete(r.id, r.completed)}
                disabled={togglingId === r.id}
              >
                {togglingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <div className="h-3.5 w-3.5 rounded-full border-2" />}
              </Button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{r.title}</p>
                <p className={`text-xs ${isOverdue ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {isOverdue ? 'Overdue — ' : ''}Due {formatDate(r.dueDate)}
                </p>
                {r.notes && <p className="text-xs text-muted-foreground mt-0.5">{r.notes}</p>}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 gap-1.5 text-xs"
                onClick={() => openPrep(r)}
                title={r.aiPrepBrief ? 'View prep brief' : 'Generate prep brief'}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {r.aiPrepBrief ? 'View prep' : 'Generate prep'}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-red-500 hover:text-red-600"
                onClick={() => handleDelete(r.id)}
                disabled={deletingId === r.id}
              >
                {deletingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              </Button>
            </div>
          );
        })}

        {completed.length > 0 && (
          <div className="space-y-1 pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-1">Completed</p>
            {completed.map((r) => (
              <div key={r.id} className="flex items-center gap-2 p-1.5 opacity-50">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => toggleComplete(r.id, r.completed)}
                  disabled={togglingId === r.id}
                >
                  <Check className="h-3.5 w-3.5 text-green-500" />
                </Button>
                <span className="text-sm line-through">{r.title}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 ml-auto text-red-500 hover:text-red-600"
                  onClick={() => handleDelete(r.id)}
                  disabled={deletingId === r.id}
                >
                  {deletingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Sheet open={prepReminderId !== null} onOpenChange={(o) => { if (!o) closePrep(); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Meeting prep brief
            </SheetTitle>
            <SheetDescription>
              History recap, recent signals, suggested questions, and likely objections.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {!prepBrief && !prepLoading && !prepError && (
              <div className="rounded-md border p-4 text-center">
                <p className="text-sm text-muted-foreground mb-3">No brief yet. Generate one to summarize history, signals, and questions for this meeting.</p>
                <Button size="sm" onClick={() => prepReminderId && generatePrep(prepReminderId)} className="gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> Generate brief
                </Button>
              </div>
            )}

            {prepLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating brief…
              </div>
            )}

            {prepError && (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">{prepError}</div>
            )}

            {prepBrief && (
              <div className="space-y-4">
                <section>
                  <h4 className="text-sm font-semibold mb-1">History recap</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{prepBrief.historyRecap}</p>
                </section>

                {prepBrief.recentSignals.length > 0 && (
                  <section>
                    <h4 className="text-sm font-semibold mb-1">Recent signals</h4>
                    <ul className="text-sm list-disc pl-4 space-y-0.5">
                      {prepBrief.recentSignals.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </section>
                )}

                {prepBrief.suggestedQuestions.length > 0 && (
                  <section>
                    <h4 className="text-sm font-semibold mb-1">Suggested questions</h4>
                    <ul className="text-sm list-disc pl-4 space-y-0.5">
                      {prepBrief.suggestedQuestions.map((q, i) => <li key={i}>{q}</li>)}
                    </ul>
                  </section>
                )}

                {prepBrief.likelyObjections.length > 0 && (
                  <section>
                    <h4 className="text-sm font-semibold mb-1">Likely objections</h4>
                    <ul className="text-sm list-disc pl-4 space-y-0.5">
                      {prepBrief.likelyObjections.map((o, i) => <li key={i}>{o}</li>)}
                    </ul>
                  </section>
                )}

                {prepSources.length > 0 && (
                  <section className="border-t pt-3">
                    <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Web sources</h4>
                    <ul className="text-xs space-y-1">
                      {prepSources.map((s, i) => (
                        <li key={i}>
                          <a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.title}</a>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <div className="pt-2 border-t">
                  <Button size="sm" variant="outline" onClick={() => prepReminderId && generatePrep(prepReminderId)} disabled={prepLoading} className="gap-1.5">
                    {prepLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Re-generate
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
