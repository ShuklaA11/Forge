'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COMPANY_SIZE_LABELS, COMPANY_TYPE_LABELS, DECISION_MAKER_LABELS, SOURCE_LABELS } from '@/types';

// --- CSV column mapping (csv_header -> form field) ---
const CSV_COLUMN_MAP: Record<string, string> = {
  first_name: 'firstName',
  last_name: 'lastName',
  company: 'company',
  title: 'title',
  role: 'role',
  email: 'email',
  phone: 'phone',
  linkedin_url: 'linkedinUrl',
  company_size: 'companySize',
  company_type: 'companyType',
  industry: 'industry',
  location: 'location',
  source: 'source',
  notes: 'notes',
};

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      const fieldName = CSV_COLUMN_MAP[header] || header;
      row[fieldName] = values[idx]?.trim() || '';
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

type AddMethod = 'choose' | 'manual' | 'csv';

function NewLeadForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [method, setMethod] = useState<AddMethod>('choose');
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  // Manual form state
  const [formData, setFormData] = useState({
    projectId: searchParams.get('projectId') || '',
    firstName: '', lastName: '', company: '', title: '',
    role: 'OTHER', email: '', phone: '', linkedinUrl: '',
    companySize: '', companyType: '', industry: '', location: '',
    source: 'MANUAL', notes: '',
  });

  // CSV state
  const [csvProjectId, setCsvProjectId] = useState(searchParams.get('projectId') || '');
  const [parsedLeads, setParsedLeads] = useState<Record<string, string>[]>([]);
  const [csvError, setCsvError] = useState('');
  const [bulkResult, setBulkResult] = useState<{ success: number; errors: { row: number; error: string }[] } | null>(null);

  useEffect(() => {
    fetch('/api/projects').then((res) => res.json()).then(setProjects);
  }, []);

  function updateField(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...formData, companySize: formData.companySize || null, companyType: formData.companyType || null }),
    });
    if (res.ok) {
      const lead = await res.json();
      router.push(`/leads/${lead.id}`);
    }
    setLoading(false);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError('');
    setBulkResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setCsvError('No data rows found in the CSV file. Make sure it has a header row and at least one data row.');
        return;
      }

      // Validate required fields
      const missingRequired = rows.some((r) => !r.firstName || !r.lastName || !r.company);
      if (missingRequired) {
        setCsvError('Some rows are missing required fields (first_name, last_name, company). They will be skipped during import.');
      }

      setParsedLeads(rows);
    };
    reader.readAsText(file);
  }

  async function handleBulkSubmit() {
    if (!csvProjectId) return;
    setLoading(true);
    setBulkResult(null);

    const res = await fetch('/api/leads/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: csvProjectId, leads: parsedLeads }),
    });

    const result = await res.json();
    setBulkResult(result);
    setLoading(false);

    if (result.success > 0 && result.errors.length === 0) {
      setTimeout(() => router.push(`/projects/${csvProjectId}`), 1500);
    }
  }

  function removeRow(index: number) {
    setParsedLeads((prev) => prev.filter((_, i) => i !== index));
  }

  // --- Method Chooser ---
  if (method === 'choose') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Add New Leads</h1>
        <div className="grid grid-cols-2 gap-4">
          <Card
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => setMethod('manual')}
          >
            <CardHeader className="text-center">
              <CardTitle className="text-lg">Add Manually</CardTitle>
              <CardDescription>Fill out the form for a single lead</CardDescription>
            </CardHeader>
          </Card>
          <Card
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => setMethod('csv')}
          >
            <CardHeader className="text-center">
              <CardTitle className="text-lg">Upload CSV</CardTitle>
              <CardDescription>Import one or more leads from a CSV file</CardDescription>
            </CardHeader>
          </Card>
        </div>
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    );
  }

  // --- CSV Upload Flow ---
  if (method === 'csv') {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => { setMethod('choose'); setParsedLeads([]); setCsvError(''); setBulkResult(null); }}>
            &larr; Back
          </Button>
          <h1 className="text-2xl font-bold">Upload CSV</h1>
        </div>

        {/* Project picker + file upload */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={csvProjectId} onValueChange={setCsvProjectId}>
                <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
                <SelectContent>{projects.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                Choose CSV File
              </Button>
              <a
                href="/templates/leads-template.csv"
                download="leads-template.csv"
                className="text-sm text-muted-foreground underline hover:text-foreground"
              >
                Download template
              </a>
            </div>

            {csvError && (
              <p className="text-sm text-yellow-500">{csvError}</p>
            )}
          </CardContent>
        </Card>

        {/* Preview table */}
        {parsedLeads.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Preview ({parsedLeads.length} lead{parsedLeads.length !== 1 ? 's' : ''})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2">#</th>
                      <th className="p-2">Name</th>
                      <th className="p-2">Company</th>
                      <th className="p-2">Title</th>
                      <th className="p-2">Email</th>
                      <th className="p-2">Source</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedLeads.map((lead, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2">
                          {lead.firstName} {lead.lastName}
                          {(!lead.firstName || !lead.lastName) && (
                            <span className="text-red-400 ml-1 text-xs">missing</span>
                          )}
                        </td>
                        <td className="p-2">
                          {lead.company || <span className="text-red-400 text-xs">missing</span>}
                        </td>
                        <td className="p-2 text-muted-foreground">{lead.title || '—'}</td>
                        <td className="p-2 text-muted-foreground">{lead.email || '—'}</td>
                        <td className="p-2 text-muted-foreground">{SOURCE_LABELS[lead.source] || lead.source || '—'}</td>
                        <td className="p-2">
                          <Button variant="ghost" size="sm" onClick={() => removeRow(i)} className="text-muted-foreground hover:text-red-400">
                            &times;
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleBulkSubmit}
                  disabled={loading || !csvProjectId || parsedLeads.length === 0}
                >
                  {loading ? 'Importing...' : `Import ${parsedLeads.length} Lead${parsedLeads.length !== 1 ? 's' : ''}`}
                </Button>
                <Button variant="outline" onClick={() => { setParsedLeads([]); setCsvError(''); setBulkResult(null); }}>
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Result summary */}
        {bulkResult && (
          <Card>
            <CardContent className="pt-6">
              {bulkResult.success > 0 && (
                <p className="text-green-500">
                  Successfully imported {bulkResult.success} lead{bulkResult.success !== 1 ? 's' : ''}.
                  {bulkResult.errors.length === 0 && ' Redirecting...'}
                </p>
              )}
              {bulkResult.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-red-400 font-medium">{bulkResult.errors.length} error(s):</p>
                  {bulkResult.errors.map((err, i) => (
                    <p key={i} className="text-sm text-red-400">Row {err.row}: {err.error}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // --- Manual Form (unchanged logic) ---
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={() => setMethod('choose')}>
          &larr; Back
        </Button>
        <h1 className="text-2xl font-bold">Add Manually</h1>
      </div>
      <Card>
        <CardHeader><CardTitle>Add New Lead</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={formData.projectId} onValueChange={(v) => updateField('projectId', v)}>
                <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
                <SelectContent>{projects.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>First Name</Label><Input value={formData.firstName} onChange={(e) => updateField('firstName', e.target.value)} required /></div>
              <div className="space-y-2"><Label>Last Name</Label><Input value={formData.lastName} onChange={(e) => updateField('lastName', e.target.value)} required /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Company</Label><Input value={formData.company} onChange={(e) => updateField('company', e.target.value)} required /></div>
              <div className="space-y-2"><Label>Title</Label><Input value={formData.title} onChange={(e) => updateField('title', e.target.value)} placeholder="e.g., VP of Operations" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Role</Label><Select value={formData.role} onValueChange={(v) => updateField('role', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DECISION_MAKER_LABELS).map(([v, l]) => (<SelectItem key={v} value={v}>{l}</SelectItem>))}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Company Size</Label><Select value={formData.companySize} onValueChange={(v) => updateField('companySize', v)}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{Object.entries(COMPANY_SIZE_LABELS).map(([v, l]) => (<SelectItem key={v} value={v}>{l}</SelectItem>))}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Company Type</Label><Select value={formData.companyType} onValueChange={(v) => updateField('companyType', v)}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{Object.entries(COMPANY_TYPE_LABELS).map(([v, l]) => (<SelectItem key={v} value={v}>{l}</SelectItem>))}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={formData.email} onChange={(e) => updateField('email', e.target.value)} /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={formData.phone} onChange={(e) => updateField('phone', e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>LinkedIn URL</Label><Input value={formData.linkedinUrl} onChange={(e) => updateField('linkedinUrl', e.target.value)} placeholder="https://linkedin.com/in/..." /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Industry</Label><Input value={formData.industry} onChange={(e) => updateField('industry', e.target.value)} placeholder="e.g., Financial Services" /></div>
              <div className="space-y-2"><Label>Location</Label><Input value={formData.location} onChange={(e) => updateField('location', e.target.value)} placeholder="e.g., Austin, TX" /></div>
            </div>
            <div className="space-y-2"><Label>Source</Label><Select value={formData.source} onValueChange={(v) => updateField('source', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SOURCE_LABELS).map(([v, l]) => (<SelectItem key={v} value={v}>{l}</SelectItem>))}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Notes</Label><Textarea value={formData.notes} onChange={(e) => updateField('notes', e.target.value)} placeholder="Any additional context..." /></div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={loading || !formData.projectId || !formData.firstName || !formData.lastName || !formData.company}>{loading ? 'Adding...' : 'Add Lead'}</Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewLeadPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
      <NewLeadForm />
    </Suspense>
  );
}
