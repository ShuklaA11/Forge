'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil } from 'lucide-react';

interface LeadEditDialogProps {
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    company: string;
    title: string | null;
    email: string | null;
    phone: string | null;
    linkedinUrl: string | null;
    location: string | null;
    industry: string | null;
    role: string;
    companySize: string | null;
    companyType: string | null;
    notes: string | null;
  };
}

export function LeadEditDialog({ lead }: LeadEditDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: lead.firstName,
    lastName: lead.lastName,
    company: lead.company,
    title: lead.title || '',
    email: lead.email || '',
    phone: lead.phone || '',
    linkedinUrl: lead.linkedinUrl || '',
    location: lead.location || '',
    industry: lead.industry || '',
    role: lead.role,
    companySize: lead.companySize || '',
    companyType: lead.companyType || '',
    notes: lead.notes || '',
  });

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const payload: Record<string, string | null> = {
      firstName: form.firstName,
      lastName: form.lastName,
      company: form.company,
      title: form.title || null,
      email: form.email || null,
      phone: form.phone || null,
      linkedinUrl: form.linkedinUrl || null,
      location: form.location || null,
      industry: form.industry || null,
      role: form.role,
      companySize: form.companySize || null,
      companyType: form.companyType || null,
      notes: form.notes || null,
    };

    await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>First Name</Label>
              <Input value={form.firstName} onChange={(e) => update('firstName', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Last Name</Label>
              <Input value={form.lastName} onChange={(e) => update('lastName', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Company</Label>
            <Input value={form.company} onChange={(e) => update('company', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="e.g. VP of Sales" />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => update('phone', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>LinkedIn URL</Label>
            <Input value={form.linkedinUrl} onChange={(e) => update('linkedinUrl', e.target.value)} placeholder="https://linkedin.com/in/..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Location</Label>
              <Input value={form.location} onChange={(e) => update('location', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Industry</Label>
              <Input value={form.industry} onChange={(e) => update('industry', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Role Level</Label>
              <Select value={form.role} onValueChange={(v) => update('role', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="C_SUITE">C-Suite</SelectItem>
                  <SelectItem value="VP">VP</SelectItem>
                  <SelectItem value="DIRECTOR">Director</SelectItem>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Company Size</Label>
              <Select value={form.companySize} onValueChange={(v) => update('companySize', v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SIZE_1_10">1-10</SelectItem>
                  <SelectItem value="SIZE_11_50">11-50</SelectItem>
                  <SelectItem value="SIZE_51_200">51-200</SelectItem>
                  <SelectItem value="SIZE_200_PLUS">200+</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Company Type</Label>
              <Select value={form.companyType} onValueChange={(v) => update('companyType', v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SMB">SMB</SelectItem>
                  <SelectItem value="BANK">Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={3} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.firstName || !form.lastName || !form.company}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
