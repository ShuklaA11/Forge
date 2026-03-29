import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Users, Kanban, Search } from 'lucide-react';
import { PIPELINE_STAGE_LABELS, PROJECT_CAMPAIGN_STAGE_LABELS } from '@/types';
import { ProjectSettingsDialog } from '@/components/project-settings-dialog';
import { ProjectSummaryCard } from '@/components/project-summary-card';

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      leads: {
        where: { status: 'ACTIVE' },
        include: {
          touchpoints: { orderBy: { sentAt: 'desc' }, take: 1 },
          outreachSequence: true,
        },
        orderBy: { priorityScore: 'desc' },
      },
    },
  });

  if (!project) notFound();

  const projectSummary = await prisma.projectSummary.findUnique({
    where: { projectId },
    select: { summary: true, insights: true, companyCount: true, leadCount: true, generatedAt: true },
  });

  const leadsByStage: Record<string, number> = {};
  project.leads.forEach((lead) => {
    leadsByStage[lead.currentStage] = (leadsByStage[lead.currentStage] || 0) + 1;
  });

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const overdueLeads = project.leads.filter((lead) => {
    if (!lead.outreachSequence?.nextTouchDate) return false;
    return new Date(lead.outreachSequence.nextTouchDate) < now;
  });

  const noContactIn7Days = project.leads.filter((lead) => {
    if (lead.touchpoints.length === 0) return true;
    return new Date(lead.touchpoints[0].sentAt) < sevenDaysAgo;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 rounded-full" style={{ backgroundColor: project.color }} />
          <div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            {project.description && <p className="text-muted-foreground">{project.description}</p>}
            {project.campaignStage && (
              <Badge variant="outline" className="mt-1 w-fit">{PROJECT_CAMPAIGN_STAGE_LABELS[project.campaignStage]}</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <ProjectSettingsDialog project={project} />
          <Link href={`/projects/${projectId}/leads`}><Button variant="outline" size="sm"><Users className="mr-2 h-4 w-4" /> Leads</Button></Link>
          <Link href={`/projects/${projectId}/pipeline`}><Button variant="outline" size="sm"><Kanban className="mr-2 h-4 w-4" /> Pipeline</Button></Link>
          <Link href={`/projects/${projectId}/research`}><Button variant="outline" size="sm"><Search className="mr-2 h-4 w-4" /> Research</Button></Link>
          <Link href={`/leads/new?projectId=${projectId}`}><Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Lead</Button></Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Active Leads</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{project.leads.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Overdue Follow-ups</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-orange-500">{overdueLeads.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">No Contact 7+ Days</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-red-500">{noContactIn7Days.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Response Rate</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {project.leads.length > 0
                ? Math.round((project.leads.filter((l) => !['RESEARCHED', 'CONTACTED'].includes(l.currentStage)).length / project.leads.length) * 100)
                : 0}%
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Pipeline</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(PIPELINE_STAGE_LABELS).map(([stage, label]) => (
              <Badge key={stage} variant="outline" className="text-sm">{label}: {leadsByStage[stage] || 0}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <ProjectSummaryCard projectId={projectId} summary={projectSummary} />

      {project.leads.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Top Priority Leads</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {project.leads.slice(0, 5).map((lead) => (
                <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div>
                    <div className="font-medium">{lead.firstName} {lead.lastName}</div>
                    <div className="text-sm text-muted-foreground">{lead.company} {lead.title ? `· ${lead.title}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{PIPELINE_STAGE_LABELS[lead.currentStage]}</Badge>
                    <Badge className={lead.priorityScore >= 70 ? 'bg-green-600' : lead.priorityScore >= 40 ? 'bg-yellow-600' : 'bg-gray-600'}>{lead.priorityScore}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
