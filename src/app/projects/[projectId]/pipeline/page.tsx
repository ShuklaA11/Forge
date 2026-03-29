'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PIPELINE_STAGE_LABELS, PIPELINE_STAGES_ORDERED } from '@/types';

interface LeadCard {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string | null;
  priorityScore: number;
  currentStage: string;
}

export default function PipelinePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [leads, setLeads] = useState<LeadCard[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchLeads = useCallback(async () => {
    const res = await fetch(`/api/leads?projectId=${projectId}`);
    const data = await res.json();
    setLeads(data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const leadId = active.id as string;
    const newStage = over.id as string;

    if (!(PIPELINE_STAGES_ORDERED as readonly string[]).includes(newStage)) return;

    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.currentStage === newStage) return;

    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, currentStage: newStage } : l)));

    await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentStage: newStage }),
    });
  }

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null;

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading pipeline...</div>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pipeline</h1>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {PIPELINE_STAGES_ORDERED.map((stage) => {
            const stageLeads = leads.filter((l) => l.currentStage === stage);
            return <StageColumn key={stage} stage={stage} label={PIPELINE_STAGE_LABELS[stage]} leads={stageLeads} />;
          })}
        </div>
        <DragOverlay>
          {activeLead ? <LeadCardDisplay lead={activeLead} isDragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function StageColumn({ stage, label, leads }: { stage: string; label: string; leads: LeadCard[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div ref={setNodeRef} className={`flex-shrink-0 w-64 rounded-lg border bg-muted/30 ${isOver ? 'border-primary bg-primary/5' : ''}`}>
      <div className="p-3 border-b">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">{label}</span>
          <Badge variant="secondary" className="text-xs">{leads.length}</Badge>
        </div>
      </div>
      <div className="p-2 space-y-2 min-h-[200px]">
        {leads.map((lead) => <DraggableLeadCard key={lead.id} lead={lead} />)}
      </div>
    </div>
  );
}

function DraggableLeadCard({ lead }: { lead: LeadCard }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });

  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={isDragging ? 'opacity-50' : ''}>
      <LeadCardDisplay lead={lead} />
    </div>
  );
}

function LeadCardDisplay({ lead, isDragging }: { lead: LeadCard; isDragging?: boolean }) {
  return (
    <Link href={`/leads/${lead.id}`}>
      <Card className={`p-3 cursor-grab hover:border-primary/50 transition-colors ${isDragging ? 'shadow-lg rotate-2' : ''}`}>
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{lead.firstName} {lead.lastName}</p>
            <p className="text-xs text-muted-foreground truncate">{lead.company}</p>
          </div>
          <Badge className={`ml-2 shrink-0 ${lead.priorityScore >= 70 ? 'bg-green-600' : lead.priorityScore >= 40 ? 'bg-yellow-600' : 'bg-gray-600'}`}>
            {lead.priorityScore}
          </Badge>
        </div>
      </Card>
    </Link>
  );
}
