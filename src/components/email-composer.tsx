'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Mail, Sparkles, Loader2, ExternalLink } from 'lucide-react';

interface EmailComposerProps {
  leadId: string;
  leadName: string;
  leadEmail: string | null;
}

export function EmailComposer({ leadId, leadName, leadEmail }: EmailComposerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [context, setContext] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [logging, setLogging] = useState(false);
  const [drafted, setDrafted] = useState(false);

  async function handleGenerateDraft() {
    setDrafting(true);
    try {
      const res = await fetch('/api/llm/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, channel: 'EMAIL', context: context || undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate draft');
      }
      const data = await res.json();
      setBody(data.draft);
      setDrafted(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate draft');
    } finally {
      setDrafting(false);
    }
  }

  function buildMailtoUrl() {
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (body) params.set('body', body);
    return `mailto:${leadEmail || ''}?${params.toString()}`;
  }

  async function handleSendAndLog() {
    // Open mailto link
    window.open(buildMailtoUrl(), '_self');

    // Log the touchpoint
    setLogging(true);
    try {
      await fetch('/api/touchpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          channel: 'EMAIL',
          direction: 'OUTBOUND',
          type: drafted ? 'FOLLOW_UP' : 'INITIAL',
          subject: subject || null,
          body: body || null,
        }),
      });
      router.refresh();
      setOpen(false);
      resetForm();
    } catch (err) {
      console.error('Failed to log touchpoint:', err);
    } finally {
      setLogging(false);
    }
  }

  function resetForm() {
    setSubject('');
    setBody('');
    setContext('');
    setDrafted(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Mail className="h-4 w-4" /> Draft Email
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Email {leadName}</DialogTitle>
          <DialogDescription>
            {leadEmail
              ? `Compose an email to ${leadEmail}`
              : 'No email on file — you can still draft and copy the message'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="context">Context for AI draft (optional)</Label>
            <Input
              id="context"
              placeholder="e.g. Follow up on pricing discussion, introduce new product..."
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleGenerateDraft}
            disabled={drafting}
          >
            {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {drafting ? 'Generating...' : 'Generate AI Draft'}
          </Button>

          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="Email subject line"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              placeholder="Write or generate your email message..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSendAndLog}
            disabled={!body.trim() || logging}
            className="gap-1.5"
          >
            {logging ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            {logging ? 'Logging...' : 'Open in Mail & Log'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
