import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PIPELINE_STAGE_LABELS } from '@/types';
import { formatRelativeDate } from '@/lib/utils';
import { Plus, ArrowRight, Bell } from 'lucide-react';

export default async function DashboardPage() {
  const projects = await prisma.project.findMany({
    where: { status: 'ACTIVE' },
    include: {
      _count: { select: { leads: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const activeLeads = await prisma.lead.findMany({
    where: { status: 'ACTIVE' },
    include: {
      project: { select: { id: true, name: true, color: true } },
      touchpoints: { orderBy: { sentAt: 'desc' }, take: 1 },
      outreachSequence: true,
    },
    orderBy: { priorityScore: 'desc' },
  });

  const totalActive = activeLeads.length;
  const leadsByStage: Record<string, number> = {};
  activeLeads.forEach((lead) => {
    leadsByStage[lead.currentStage] = (leadsByStage[lead.currentStage] || 0) + 1;
  });

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const overdueLeads = activeLeads.filter((lead) => {
    if (lead.touchpoints.length === 0) return true;
    return new Date(lead.touchpoints[0].sentAt) < sevenDaysAgo;
  });

  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
  thisWeekStart.setHours(0, 0, 0, 0);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const touchpointsThisWeek = await prisma.touchpoint.count({
    where: {
      sentAt: { gte: thisWeekStart },
      direction: 'OUTBOUND',
    },
  });

  const touchpointsLastWeek = await prisma.touchpoint.count({
    where: {
      sentAt: { gte: lastWeekStart, lt: thisWeekStart },
      direction: 'OUTBOUND',
    },
  });

  const respondedCount = activeLeads.filter(
    (l) => !['RESEARCHED', 'CONTACTED'].includes(l.currentStage)
  ).length;
  const contactedOrBeyond = activeLeads.filter(
    (l) => l.currentStage !== 'RESEARCHED'
  ).length;
  const responseRate = contactedOrBeyond > 0
    ? Math.round((respondedCount / contactedOrBeyond) * 100)
    : 0;

  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingReminders = await prisma.reminder.findMany({
    where: {
      completed: false,
      dueDate: { lte: sevenDaysFromNow },
    },
    include: {
      lead: {
        select: { id: true, firstName: true, lastName: true, company: true },
      },
    },
    orderBy: { dueDate: 'asc' },
    take: 10,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Overview across all projects</p>
        </div>
        <Link href="/projects/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> New Project
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalActive}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overdue (7+ days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${overdueLeads.length > 0 ? 'text-orange-500' : ''}`}>
              {overdueLeads.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Response Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{responseRate}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Contacted This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{touchpointsThisWeek}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Contacted Last Week</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-muted-foreground">{touchpointsLastWeek}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pipeline Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            {Object.entries(PIPELINE_STAGE_LABELS).map(([stage, label]) => {
              const count = leadsByStage[stage] || 0;
              return (
                <div key={stage} className="flex items-center gap-2 px-3 py-2 rounded-lg border">
                  <span className="text-sm font-medium">{label}</span>
                  <Badge variant={count > 0 ? 'default' : 'secondary'}>{count}</Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Projects</CardTitle>
            <Link href="/projects">
              <Button variant="ghost" size="sm">View All <ArrowRight className="ml-1 h-3 w-3" /></Button>
            </Link>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-muted-foreground text-sm">No projects yet.</p>
            ) : (
              <div className="space-y-3">
                {projects.slice(0, 5).map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
                      <span className="font-medium">{project.name}</span>
                    </div>
                    <Badge variant="secondary">{project._count.leads} leads</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Priority Leads</CardTitle>
          </CardHeader>
          <CardContent>
            {activeLeads.length === 0 ? (
              <p className="text-muted-foreground text-sm">No active leads yet.</p>
            ) : (
              <div className="space-y-3">
                {activeLeads.slice(0, 5).map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <div className="font-medium text-sm">{lead.firstName} {lead.lastName}</div>
                      <div className="text-xs text-muted-foreground">
                        {lead.company} · {lead.project.name}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {PIPELINE_STAGE_LABELS[lead.currentStage]}
                      </Badge>
                      <Badge
                        className={
                          lead.priorityScore >= 70
                            ? 'bg-green-600'
                            : lead.priorityScore >= 40
                            ? 'bg-yellow-600'
                            : 'bg-gray-600'
                        }
                      >
                        {lead.priorityScore}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {upcomingReminders.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-lg">Upcoming Reminders</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingReminders.map((reminder) => {
                const isOverdue = new Date(reminder.dueDate) < now;
                return (
                  <Link
                    key={reminder.id}
                    href={`/leads/${reminder.lead.id}`}
                    className={`flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors ${isOverdue ? 'border-red-500/30 bg-red-500/5' : ''}`}
                  >
                    <div>
                      <div className="font-medium text-sm">{reminder.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {reminder.lead.firstName} {reminder.lead.lastName} · {reminder.lead.company}
                      </div>
                    </div>
                    <Badge variant={isOverdue ? 'destructive' : 'outline'} className="text-xs">
                      {isOverdue ? 'Overdue' : ''} {formatRelativeDate(reminder.dueDate)}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
