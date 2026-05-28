import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Users, Kanban, Search, BookOpen, ExternalLink } from 'lucide-react';
import { PROJECT_CAMPAIGN_STAGE_LABELS } from '@/types';
import { ProjectSettingsDialog } from '@/components/project-settings-dialog';
import { AssistantChat } from '@/components/assistant-chat';
import { ProjectFeed } from '@/components/project-feed';
import { formatRelativeDate } from '@/lib/utils';

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) notFound();

  const now = new Date();

  const [activeLeadCount, overdueLeads, recentTasks, recentResources] = await Promise.all([
    prisma.lead.count({ where: { projectId, status: 'ACTIVE' } }),
    prisma.lead.findMany({
      where: {
        projectId,
        status: 'ACTIVE',
        outreachSequence: { nextTouchDate: { lt: now } },
      },
      select: { id: true },
    }),
    prisma.task.findMany({
      where: { projectId, completed: false },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 5,
    }),
    prisma.resource.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 rounded-full" style={{ backgroundColor: project.color }} />
          <div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
            {project.campaignStage && (
              <Badge variant="outline" className="mt-1 w-fit">{PROJECT_CAMPAIGN_STAGE_LABELS[project.campaignStage]}</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ProjectSettingsDialog project={project} />
          <Link href={`/projects/${projectId}/leads`}><Button variant="outline" size="sm"><Users className="mr-2 h-4 w-4" /> Leads</Button></Link>
          <Link href={`/projects/${projectId}/pipeline`}><Button variant="outline" size="sm"><Kanban className="mr-2 h-4 w-4" /> Pipeline</Button></Link>
          <Link href={`/projects/${projectId}/research`}><Button variant="outline" size="sm"><Search className="mr-2 h-4 w-4" /> Research</Button></Link>
          {project.wikiEnabled && (
            <Link href={`/projects/${projectId}/wiki`}><Button variant="outline" size="sm"><BookOpen className="mr-2 h-4 w-4" /> Wiki</Button></Link>
          )}
          <Link href={`/leads/new?projectId=${projectId}`}><Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Lead</Button></Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 h-[calc(100vh-220px)] min-h-[500px] border rounded-lg p-4">
          <AssistantChat
            projectIds={[projectId]}
            filterConversationsByProjectId={projectId}
            headerTitle={project.name}
            headerSubtitle="Per-project assistant"
            emptyStatePrompt={`Ask anything about ${project.name} — strategy, leads, pipeline, or this project's wiki and saved resources.`}
            suggestions={[
              'Summarize what we know about this project',
              'Which leads need follow-up this week?',
              'Draft a positioning paragraph using saved resources',
            ]}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Pipeline</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Active leads</span>
                <Link href={`/projects/${projectId}/leads`} className="font-medium hover:underline">{activeLeadCount}</Link>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Overdue follow-ups</span>
                <span className={`font-medium ${overdueLeads.length > 0 ? 'text-orange-500' : ''}`}>{overdueLeads.length}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Open Tasks</CardTitle>
              <span className="text-xs text-muted-foreground">{recentTasks.length}</span>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {recentTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No open tasks.</p>
              ) : (
                recentTasks.map((t) => (
                  <div key={t.id} className="flex items-start justify-between gap-2">
                    <span className="truncate">{t.title}</span>
                    {t.dueAt && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatRelativeDate(t.dueAt)}
                      </span>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Resources</CardTitle>
              <span className="text-xs text-muted-foreground">{recentResources.length}</span>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {recentResources.length === 0 ? (
                <p className="text-xs text-muted-foreground">No saved resources yet.</p>
              ) : (
                recentResources.map((r) => (
                  <a
                    key={r.id}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-1.5 hover:bg-muted/50 rounded px-1 py-0.5 -mx-1"
                  >
                    <ExternalLink className="size-3 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{r.title || r.url}</span>
                  </a>
                ))
              )}
            </CardContent>
          </Card>

          <ProjectFeed projectId={projectId} />
        </div>
      </div>
    </div>
  );
}
