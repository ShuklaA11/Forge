'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PROJECT_CAMPAIGN_STAGE_LABELS, PROJECT_CAMPAIGN_STAGES_ORDERED } from '@/types';
import type { Project } from '@/types';

interface Props {
  project: Project;
}

export function ProjectSettingsDialog({ project }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [idea, setIdea] = useState(project.idea ?? '');
  const [approach, setApproach] = useState(project.approach ?? '');
  const [campaignStage, setCampaignStage] = useState(project.campaignStage);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: description || null,
        idea: idea || null,
        approach: approach || null,
        campaignStage,
      }),
    });
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
    router.push('/projects');
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      // Reset form to current project values when opening
      setName(project.name);
      setDescription(project.description ?? '');
      setIdea(project.idea ?? '');
      setApproach(project.approach ?? '');
      setCampaignStage(project.campaignStage);
      setConfirmDelete(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings className="h-4 w-4" /> Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Project Settings</DialogTitle>
          <DialogDescription>Update your project details or delete this project.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Project Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of this campaign..." rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Idea</Label>
            <Textarea value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="What is this campaign about? Who are you targeting and why?" rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Approach</Label>
            <Textarea value={approach} onChange={(e) => setApproach(e.target.value)} placeholder="How do you plan to execute? e.g., cold email sequence, LinkedIn DM + follow-up call..." rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Campaign Stage</Label>
            <Select value={campaignStage} onValueChange={(v) => setCampaignStage(v as typeof campaignStage)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROJECT_CAMPAIGN_STAGES_ORDERED.map((s) => (
                  <SelectItem key={s} value={s}>{PROJECT_CAMPAIGN_STAGE_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {!confirmDelete ? (
            <Button variant="destructive" size="sm" className="w-full" onClick={() => setConfirmDelete(true)}>
              Delete Project
            </Button>
          ) : (
            <div className="rounded-md border border-destructive/50 p-3 space-y-3">
              <p className="text-sm text-destructive font-medium">
                This will archive the project and hide it from your dashboard. Are you sure?
              </p>
              <div className="flex gap-2">
                <Button variant="destructive" size="sm" disabled={deleting} onClick={handleDelete}>
                  {deleting ? 'Deleting...' : 'Yes, Delete'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={saving || !name} onClick={handleSave}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
