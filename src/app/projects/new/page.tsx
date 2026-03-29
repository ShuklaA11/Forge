'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROJECT_CAMPAIGN_STAGE_LABELS, PROJECT_CAMPAIGN_STAGES_ORDERED } from '@/types';

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
];

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [idea, setIdea] = useState('');
  const [approach, setApproach] = useState('');
  const [campaignStage, setCampaignStage] = useState('IDEATION');
  const [color, setColor] = useState(COLORS[0]);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, idea, approach, campaignStage, color }),
    });
    if (res.ok) {
      const project = await res.json();
      router.push(`/projects/${project.id}`);
    }
    setLoading(false);
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader><CardTitle>New Project</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Q1 SMB Outreach" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of this campaign..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="idea">Idea (optional)</Label>
              <Textarea id="idea" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="What is this campaign about? Who are you targeting and why?" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="approach">Approach (optional)</Label>
              <Textarea id="approach" value={approach} onChange={(e) => setApproach(e.target.value)} placeholder="How do you plan to execute? e.g., cold email sequence, LinkedIn DM + follow-up call..." />
            </div>
            <div className="space-y-2">
              <Label>Campaign Stage</Label>
              <Select value={campaignStage} onValueChange={setCampaignStage}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_CAMPAIGN_STAGES_ORDERED.map((stage) => (
                    <SelectItem key={stage} value={stage}>{PROJECT_CAMPAIGN_STAGE_LABELS[stage]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button key={c} type="button" className={`h-8 w-8 rounded-full border-2 transition-all ${color === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} onClick={() => setColor(c)} />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={loading || !name}>{loading ? 'Creating...' : 'Create Project'}</Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
