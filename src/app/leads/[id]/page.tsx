import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PIPELINE_STAGE_LABELS, CONVERSATION_STAGE_LABELS, DECISION_MAKER_LABELS, COMPANY_SIZE_LABELS, COMPANY_TYPE_LABELS, CHANNEL_LABELS, SOURCE_LABELS } from '@/types';
import { formatDate, formatRelativeDate } from '@/lib/utils';
import { ArrowLeft, Mail, Phone, Linkedin, MapPin, Clock } from 'lucide-react';
import { StageUpdater } from '@/components/stage-updater';
import { ConversationStageUpdater } from '@/components/conversation-stage-updater';
import { EmailComposer } from '@/components/email-composer';
import { CallLogger } from '@/components/call-logger';
import { CallList } from '@/components/call-list';
import { CompanySummaryCard } from '@/components/company-summary-card';
import { LeadEditDialog } from '@/components/lead-edit-dialog';
import { ReminderSection } from '@/components/reminder-form';

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true, color: true } },
      stageHistory: { orderBy: { enteredAt: 'desc' } },
      touchpoints: { orderBy: { sentAt: 'desc' } },
      outreachSequence: true,
      calls: { orderBy: { callDate: 'desc' } },
      reminders: { orderBy: { dueDate: 'asc' } },
    },
  });

  if (!lead) notFound();

  const companySummary = await prisma.companySummary.findUnique({
    where: { projectId_companyName: { projectId: lead.projectId, companyName: lead.company } },
    select: { summary: true, insights: true, nextSteps: true, generatedAt: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/projects/${lead.projectId}/leads`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
            <ArrowLeft className="h-3 w-3" /> Back to {lead.project.name}
          </Link>
          <h1 className="text-2xl font-bold">{lead.firstName} {lead.lastName}</h1>
          <p className="text-muted-foreground">{lead.title ? `${lead.title} at ` : ''}{lead.company}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StageUpdater leadId={lead.id} currentStage={lead.currentStage} />
          <ConversationStageUpdater leadId={lead.id} currentStage={lead.conversationStage} />
          <Badge className={lead.priorityScore >= 70 ? 'bg-green-600' : lead.priorityScore >= 40 ? 'bg-yellow-600' : 'bg-gray-600'}>Score: {lead.priorityScore}</Badge>
          <LeadEditDialog lead={lead} />
          <EmailComposer leadId={lead.id} leadName={`${lead.firstName} ${lead.lastName}`} leadEmail={lead.email} />
          <CallLogger leadId={lead.id} leadName={`${lead.firstName} ${lead.lastName}`} />
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="calls">Contacts ({lead.calls.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <CompanySummaryCard
            projectId={lead.projectId}
            companyName={lead.company}
            summary={companySummary}
          />
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-1">
              <CardHeader><CardTitle className="text-lg">Contact Info</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {lead.email && <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /><a href={`mailto:${lead.email}`} className="hover:underline">{lead.email}</a></div>}
                {lead.phone && <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /><span>{lead.phone}</span></div>}
                {lead.linkedinUrl && <div className="flex items-center gap-2 text-sm"><Linkedin className="h-4 w-4 text-muted-foreground" /><a href={lead.linkedinUrl} target="_blank" rel="noopener" className="hover:underline">LinkedIn Profile</a></div>}
                {lead.location && <div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" /><span>{lead.location}</span></div>}
                <Separator />
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Role</span><span>{DECISION_MAKER_LABELS[lead.role]}</span></div>
                  {lead.companySize && <div className="flex justify-between"><span className="text-muted-foreground">Company Size</span><span>{COMPANY_SIZE_LABELS[lead.companySize]}</span></div>}
                  {lead.companyType && <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{COMPANY_TYPE_LABELS[lead.companyType]}</span></div>}
                  {lead.industry && <div className="flex justify-between"><span className="text-muted-foreground">Industry</span><span>{lead.industry}</span></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">Source</span><span>{SOURCE_LABELS[lead.source]}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Conv. Stage</span><span>{CONVERSATION_STAGE_LABELS[lead.conversationStage]}</span></div>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-lg">Activity Timeline</CardTitle></CardHeader>
              <CardContent>
                {lead.touchpoints.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No activity yet.</p>
                ) : (
                  <div className="space-y-4">
                    {lead.touchpoints.map((tp) => (
                      <div key={tp.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`h-2 w-2 rounded-full mt-2 ${tp.direction === 'INBOUND' ? 'bg-green-500' : 'bg-blue-500'}`} />
                          <div className="w-px flex-1 bg-border" />
                        </div>
                        <div className="flex-1 pb-4">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">{CHANNEL_LABELS[tp.channel]}</Badge>
                            <span className="text-xs text-muted-foreground">{tp.direction === 'INBOUND' ? 'Received' : 'Sent'} · {formatRelativeDate(tp.sentAt)}</span>
                            {tp.gotReply && <Badge className="bg-green-600 text-xs">Got Reply</Badge>}
                          </div>
                          {tp.subject && <p className="text-sm font-medium">{tp.subject}</p>}
                          {tp.body && <p className="text-sm text-muted-foreground line-clamp-2">{tp.body}</p>}
                          {tp.notes && <p className="text-xs text-muted-foreground mt-1 italic">{tp.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-lg">Stage History</CardTitle></CardHeader>
            <CardContent>
              <div className="flex gap-4 flex-wrap">
                {lead.stageHistory.map((sh) => (
                  <div key={sh.id} className="flex items-center gap-2 text-sm">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="outline">{PIPELINE_STAGE_LABELS[sh.stage]}</Badge>
                    <span className="text-muted-foreground">{formatDate(sh.enteredAt)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <ReminderSection leadId={lead.id} reminders={lead.reminders} />

          <Card>
            <CardHeader><CardTitle className="text-lg">Notes</CardTitle></CardHeader>
            <CardContent>
              {lead.notes ? (
                <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No notes yet. Click Edit to add notes.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calls" className="mt-4">
          <CallList calls={lead.calls} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
