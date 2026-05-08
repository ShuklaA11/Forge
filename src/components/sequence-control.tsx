'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send } from 'lucide-react';

type SequenceStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'EXHAUSTED';

interface Props {
  leadId: string;
  sequence: {
    id: string;
    currentStep: number;
    maxSteps: number;
    status: SequenceStatus;
  } | null;
}

const STATUS_LABELS: Record<SequenceStatus, string> = {
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  COMPLETED: 'Replied',
  EXHAUSTED: 'Exhausted',
};

const STATUS_CLASSES: Record<SequenceStatus, string> = {
  ACTIVE: 'bg-blue-600/30 text-blue-200 border-blue-500/30',
  PAUSED: 'bg-white/10 text-white/60 border-white/15',
  COMPLETED: 'bg-green-600/30 text-green-200 border-green-500/30',
  EXHAUSTED: 'bg-amber-600/30 text-amber-200 border-amber-500/30',
};

export function SequenceControl({ leadId, sequence }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function startSequence() {
    setCreating(true);
    try {
      const res = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start sequence');
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start sequence');
    } finally {
      setCreating(false);
    }
  }

  if (!sequence) {
    return (
      <Button size="sm" variant="outline" onClick={startSequence} disabled={creating}>
        {creating ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Send className="size-3.5 mr-1.5" />}
        Start sequence
      </Button>
    );
  }

  return (
    <Badge variant="outline" className={STATUS_CLASSES[sequence.status]}>
      Sequence: {STATUS_LABELS[sequence.status]} · {sequence.currentStep}/{sequence.maxSteps}
    </Badge>
  );
}
