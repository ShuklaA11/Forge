import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Building2 } from 'lucide-react';
import { PIPELINE_STAGE_LABELS, CONVERSATION_STAGE_LABELS } from '@/types';
import { formatRelativeDate } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CompanyGroup } from '@/components/company-group';

export default async function ProjectLeadsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) notFound();

  const leads = await prisma.lead.findMany({
    where: { projectId, status: 'ACTIVE' },
    include: {
      touchpoints: { orderBy: { sentAt: 'desc' }, take: 1 },
      _count: { select: { touchpoints: true, calls: true } },
    },
    orderBy: { priorityScore: 'desc' },
  });

  // Group leads by company
  const companiesMap = new Map<string, typeof leads>();
  for (const lead of leads) {
    const group = companiesMap.get(lead.company) || [];
    group.push(lead);
    companiesMap.set(lead.company, group);
  }

  // Sort companies by highest priority lead in each group
  const companies = [...companiesMap.entries()].sort((a, b) => {
    const maxA = Math.max(...a[1].map(l => l.priorityScore));
    const maxB = Math.max(...b[1].map(l => l.priorityScore));
    return maxB - maxA;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project.name} — Leads</h1>
          <p className="text-muted-foreground">{leads.length} active leads across {companies.length} {companies.length === 1 ? 'company' : 'companies'}</p>
        </div>
        <Link href={`/leads/new?projectId=${projectId}`}>
          <Button><Plus className="mr-2 h-4 w-4" /> Add Lead</Button>
        </Link>
      </div>

      {leads.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg mb-2">No leads yet</p>
          <p className="mb-4">Add your first lead to get started.</p>
          <Link href={`/leads/new?projectId=${projectId}`}><Button>Add Lead</Button></Link>
        </div>
      ) : (
        <div className="space-y-3">
          {companies.map(([companyName, companyLeads]) => (
            <CompanyGroup key={companyName} companyName={companyName} leads={companyLeads} />
          ))}
        </div>
      )}
    </div>
  );
}
