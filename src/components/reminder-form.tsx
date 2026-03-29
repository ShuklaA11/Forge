'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Bell, Plus, Check, Trash2, Loader2, X } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface ReminderData {
  id: string;
  title: string;
  notes: string | null;
  dueDate: Date;
  completed: boolean;
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
    </Card>
  );
}
