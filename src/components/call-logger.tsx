'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { MessageSquare, Loader2, Sparkles, Upload, FileText } from 'lucide-react';
import { CALL_SENTIMENT_LABELS } from '@/types';
import type { StructuredNotes } from '@/types';

interface CallLoggerProps {
  leadId: string;
  leadName: string;
}

type Step = 'input' | 'uploading' | 'transcribing' | 'generating' | 'review';

export function CallLogger({ leadId, leadName }: CallLoggerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'recording' | 'manual'>('recording');
  const [step, setStep] = useState<Step>('input');

  // Form state
  const [title, setTitle] = useState('');
  const [callDate, setCallDate] = useState(new Date().toISOString().slice(0, 16));
  const [durationMinutes, setDurationMinutes] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // Result state
  const [callId, setCallId] = useState<string | null>(null);
  const [structuredNotes, setStructuredNotes] = useState<StructuredNotes | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setMode('recording');
    setStep('input');
    setTitle('');
    setCallDate(new Date().toISOString().slice(0, 16));
    setDurationMinutes('');
    setManualNotes('');
    setFile(null);
    setCallId(null);
    setStructuredNotes(null);
    setError(null);
  }

  async function handleSubmitRecording() {
    if (!file) return;
    setError(null);

    try {
      // Step 1: Upload
      setStep('uploading');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('leadId', leadId);

      const uploadRes = await fetch('/api/calls/upload', { method: 'POST', body: formData });
      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || 'Upload failed');
      }
      const { filePath } = await uploadRes.json();

      // Step 2: Create call record
      const createRes = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          title: title || `Contact with ${leadName}`,
          callDate,
          durationMinutes: durationMinutes ? parseInt(durationMinutes) : null,
          audioFilePath: filePath,
          manualNotes: manualNotes || null,
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error || 'Failed to create call');
      }
      const call = await createRes.json();
      setCallId(call.id);

      // Step 3: Process (transcribe + generate notes)
      setStep('transcribing');
      const processRes = await fetch('/api/calls/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: call.id }),
      });

      if (!processRes.ok) {
        const err = await processRes.json();
        throw new Error(err.error || 'Processing failed');
      }
      const processed = await processRes.json();
      setStructuredNotes(processed.structuredNotes as StructuredNotes);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStep('input');
    }
  }

  async function handleSubmitManual() {
    if (!manualNotes.trim()) return;
    setError(null);

    try {
      // Step 1: Create call record
      setStep('generating');
      const createRes = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          title: title || `Contact with ${leadName}`,
          callDate,
          durationMinutes: durationMinutes ? parseInt(durationMinutes) : null,
          manualNotes,
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error || 'Failed to create call');
      }
      const call = await createRes.json();
      setCallId(call.id);

      // Step 2: Process (generate notes from manual notes)
      const processRes = await fetch('/api/calls/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: call.id, manualOnly: true }),
      });

      if (!processRes.ok) {
        const err = await processRes.json();
        throw new Error(err.error || 'Processing failed');
      }
      const processed = await processRes.json();
      setStructuredNotes(processed.structuredNotes as StructuredNotes);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStep('input');
    }
  }

  async function handleSaveAndClose() {
    // Notes are already saved via the process endpoint
    router.refresh();
    setOpen(false);
    resetForm();
  }

  const isProcessing = step === 'uploading' || step === 'transcribing' || step === 'generating';

  const stepLabel: Record<Step, string> = {
    input: '',
    uploading: 'Uploading audio...',
    transcribing: 'Transcribing & generating notes (this may take 30-60s)...',
    generating: 'Generating structured notes...',
    review: '',
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <MessageSquare className="h-4 w-4" /> Log Contact
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log Contact with {leadName}</DialogTitle>
          <DialogDescription>
            Upload a recording or enter manual notes to generate AI-structured insights.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {step === 'input' && (
          <div className="space-y-4">
            {/* Mode toggle */}
            <div className="flex gap-2">
              <Button
                variant={mode === 'recording' ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={() => setMode('recording')}
              >
                <Upload className="h-4 w-4" /> With Recording
              </Button>
              <Button
                variant={mode === 'manual' ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={() => setMode('manual')}
              >
                <FileText className="h-4 w-4" /> Manual Notes
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="call-title">Title</Label>
              <Input
                id="call-title"
                placeholder={`e.g. Intro contact with ${leadName}`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="call-date">Date & Time</Label>
                <Input
                  id="call-date"
                  type="datetime-local"
                  value={callDate}
                  onChange={(e) => setCallDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="call-duration">Duration (minutes)</Label>
                <Input
                  id="call-duration"
                  type="number"
                  placeholder="e.g. 20"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                />
              </div>
            </div>

            {mode === 'recording' && (
              <div className="space-y-1.5">
                <Label htmlFor="call-file">Recording (m4a, mp4, wav, webm — max 25MB)</Label>
                <Input
                  id="call-file"
                  type="file"
                  accept=".m4a,.mp4,.mp3,.wav,.webm"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="call-notes">
                {mode === 'recording' ? 'Additional notes (optional)' : 'Call notes'}
              </Label>
              <Textarea
                id="call-notes"
                placeholder={mode === 'recording'
                  ? 'Any additional context about the contact...'
                  : 'Write your notes here — key points, quotes, outcomes, next steps...'}
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                rows={mode === 'manual' ? 8 : 3}
              />
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{stepLabel[step]}</p>
          </div>
        )}

        {step === 'review' && structuredNotes && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {CALL_SENTIMENT_LABELS[structuredNotes.sentiment?.toUpperCase()] || structuredNotes.sentiment}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Score: {structuredNotes.sentimentScore?.toFixed(2)}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-medium mb-1">Summary</h4>
                <p className="text-sm text-muted-foreground">{structuredNotes.summary}</p>
              </div>

              {structuredNotes.keyPoints.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Key Points</h4>
                  <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-0.5">
                    {structuredNotes.keyPoints.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}

              {structuredNotes.objections.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Objections</h4>
                  <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-0.5">
                    {structuredNotes.objections.map((o, i) => <li key={i}>{o}</li>)}
                  </ul>
                </div>
              )}

              {structuredNotes.validationSignals.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Validation Signals</h4>
                  <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-0.5">
                    {structuredNotes.validationSignals.map((v, i) => <li key={i}>{v}</li>)}
                  </ul>
                </div>
              )}

              {structuredNotes.commitments.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Commitments</h4>
                  <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-0.5">
                    {structuredNotes.commitments.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}

              {structuredNotes.nextSteps.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Next Steps</h4>
                  <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-0.5">
                    {structuredNotes.nextSteps.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}

              {structuredNotes.quotes.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Key Quotes</h4>
                  <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-0.5">
                    {structuredNotes.quotes.map((q, i) => <li key={i}>&ldquo;{q}&rdquo;</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'input' && mode === 'recording' && (
            <Button
              onClick={handleSubmitRecording}
              disabled={!file}
              className="gap-1.5"
            >
              <Sparkles className="h-4 w-4" />
              Upload & Process
            </Button>
          )}
          {step === 'input' && mode === 'manual' && (
            <Button
              onClick={handleSubmitManual}
              disabled={!manualNotes.trim()}
              className="gap-1.5"
            >
              <Sparkles className="h-4 w-4" />
              Generate Notes
            </Button>
          )}
          {step === 'review' && (
            <Button onClick={handleSaveAndClose} className="gap-1.5">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
