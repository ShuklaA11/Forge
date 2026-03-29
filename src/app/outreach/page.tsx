import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PIPELINE_STAGE_LABELS, CHANNEL_LABELS } from '@/types';
import { formatRelativeDate, formatDate } from '@/lib/utils';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default async function OutreachPage() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Leads with overdue outreach sequences
  const overdueSequences = await prisma.lead.findMany({
    where: {
      status: 'ACTIVE',
      outreachSequence: {
        status: 'ACTIVE',
        nextTouchDate: { lt: now },
      },
    },
    include: {
      project: { select: { id: true, name: true, color: true } },
      outreachSequence: true,
      touchpoints: { orderBy: { sentAt: 'desc' }, take: 1 },
    },
    orderBy: { priorityScore: 'desc' },
  });

  // Leads with no contact in 7+ days (no active sequence)
  const staleLeads = await prisma.lead.findMany({
    where: {
      status: 'ACTIVE',
      currentStage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
      outreachSequence: null,
      touchpoints: {
        every: { sentAt: { lt: sevenDaysAgo } },
      },
    },
    include: {
      project: { select: { id: true, name: true, color: true } },
      touchpoints: { orderBy: { sentAt: 'desc' }, take: 1 },
    },
    orderBy: { priorityScore: 'desc' },
    take: 20,
  });

  // Leads with no touchpoints at all
  const untouchedLeads = await prisma.lead.findMany({
    where: {
      status: 'ACTIVE',
      touchpoints: { none: {} },
    },
    include: {
      project: { select: { id: true, name: true, color: true } },
    },
    orderBy: { priorityScore: 'desc' },
    take: 20,
  });

  // Today's scheduled touches
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const dueTodaySequences = await prisma.lead.findMany({
    where: {
      status: 'ACTIVE',
      outreachSequence: {
        status: 'ACTIVE',
        nextTouchDate: { gte: todayStart, lte: todayEnd },
      },
    },
    include: {
      project: { select: { id: true, name: true, color: true } },
      outreachSequence: true,
      touchpoints: { orderBy: { sentAt: 'desc' }, take: 1 },
    },
    orderBy: { priorityScore: 'desc' },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Outreach Queue</h1>
        <p className="text-muted-foreground">Who should you contact today?</p>
      </div>

      {/* Overdue */}
      <Card className={overdueSequences.length > 0 ? 'border-orange-500/50' : ''}>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Overdue Follow-ups
            <Badge variant="destructive">{overdueSequences.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {overdueSequences.length === 0 ? (
            <p className="text-muted-foreground text-sm">No overdue follow-ups. Nice work!</p>
          ) : (
            <div className="space-y-2">
              {overdueSequences.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <div className="font-medium">{lead.firstName} {lead.lastName}</div>
                    <div className="text-xs text-muted-foreground">
                      {lead.company} · {lead.project.name} · Step {lead.outreachSequence?.currentStep}/{lead.outreachSequence?.maxSteps}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-orange-500">
                      Due {lead.outreachSequence?.nextTouchDate ? formatRelativeDate(lead.outreachSequence.nextTouchDate) : 'N/A'}
                    </span>
                    <Badge className={lead.priorityScore >= 70 ? 'bg-green-600' : lead.priorityScore >= 40 ? 'bg-yellow-600' : 'bg-gray-600'}>
                      {lead.priorityScore}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Due Today */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
            Due Today
            <Badge>{dueTodaySequences.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dueTodaySequences.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing scheduled for today.</p>
          ) : (
            <div className="space-y-2">
              {dueTodaySequences.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <div className="font-medium">{lead.firstName} {lead.lastName}</div>
                    <div className="text-xs text-muted-foreground">
                      {lead.company} · {lead.project.name}
                    </div>
                  </div>
                  <Badge variant="outline">{PIPELINE_STAGE_LABELS[lead.currentStage]}</Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Untouched Leads */}
      {untouchedLeads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              Never Contacted
              <Badge variant="secondary">{untouchedLeads.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {untouchedLeads.slice(0, 10).map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <div className="font-medium">{lead.firstName} {lead.lastName}</div>
                    <div className="text-xs text-muted-foreground">
                      {lead.company} · {lead.project.name}
                    </div>
                  </div>
                  <Badge className={lead.priorityScore >= 70 ? 'bg-green-600' : lead.priorityScore >= 40 ? 'bg-yellow-600' : 'bg-gray-600'}>
                    {lead.priorityScore}
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stale Leads */}
      {staleLeads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Stale Leads (7+ days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {staleLeads.slice(0, 10).map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <div className="font-medium">{lead.firstName} {lead.lastName}</div>
                    <div className="text-xs text-muted-foreground">
                      {lead.company} · Last contact: {lead.touchpoints[0] ? formatRelativeDate(lead.touchpoints[0].sentAt) : 'Never'}
                    </div>
                  </div>
                  <Badge variant="outline">{PIPELINE_STAGE_LABELS[lead.currentStage]}</Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
