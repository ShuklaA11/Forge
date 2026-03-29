'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CONVERSATION_STAGES_ORDERED, CONVERSATION_STAGE_LABELS } from '@/types';

export function ConversationStageUpdater({ leadId, currentStage }: { leadId: string; currentStage: string }) {
  const router = useRouter();
  const [updating, setUpdating] = useState(false);

  async function handleStageChange(newStage: string) {
    if (newStage === currentStage) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationStage: newStage }),
      });
      if (!res.ok) throw new Error('Failed to update conversation stage');
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <Select value={currentStage} onValueChange={handleStageChange} disabled={updating}>
      <SelectTrigger size="sm" className="w-[140px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CONVERSATION_STAGES_ORDERED.map((stage) => (
          <SelectItem key={stage} value={stage}>
            {CONVERSATION_STAGE_LABELS[stage]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
