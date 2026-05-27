import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatRelativeDate } from '@/lib/utils';
import type { TriageResult, TriageIntent } from '@/lib/agents/reply-triage';
import type { CoachReview } from '@/lib/agents/call-coach';

interface TouchpointLike {
  id: string;
  direction: string;
  sentAt: Date;
  subject: string | null;
  aiTriage: unknown;
}

interface CallLike {
  id: string;
  title: string;
  callDate: Date;
  coachReview: unknown;
}

interface ReminderLike {
  id: string;
  title: string;
  dueDate: Date;
  aiPrepBrief: string | null;
}

interface LeadAITabProps {
  touchpoints: TouchpointLike[];
  calls: CallLike[];
  reminders: ReminderLike[];
}

const INTENT_LABELS: Record<TriageIntent, string> = {
  interested: 'Interested',
  objection: 'Objection',
  schedule_meeting: 'Schedule meeting',
  unsubscribe: 'Unsubscribe',
  other: 'Other',
};

const INTENT_VARIANTS: Record<TriageIntent, string> = {
  interested: 'bg-green-600',
  objection: 'bg-yellow-600',
  schedule_meeting: 'bg-blue-600',
  unsubscribe: 'bg-red-600',
  other: 'bg-gray-600',
};

function isTriage(value: unknown): value is TriageResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'intent' in value &&
    'summary' in value
  );
}

function isCoachReview(value: unknown): value is CoachReview {
  return (
    typeof value === 'object' &&
    value !== null &&
    'missedQuestions' in value &&
    'unaddressedObjections' in value &&
    'commitments' in value
  );
}

const EMPTY = 'No AI output yet — surfaces appear after triage/coach/prep run in context.';

export function LeadAITab({ touchpoints, calls, reminders }: LeadAITabProps) {
  const triagedInbound = touchpoints.filter(
    (tp) => tp.direction === 'INBOUND' && isTriage(tp.aiTriage),
  );
  const coachedCalls = calls.filter((c) => isCoachReview(c.coachReview));
  const prepBriefs = reminders.filter((r) => r.aiPrepBrief && r.aiPrepBrief.trim().length > 0);

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Inbound Reply Triage</CardTitle>
        </CardHeader>
        <CardContent>
          {triagedInbound.length === 0 ? (
            <p className="text-sm text-muted-foreground">{EMPTY}</p>
          ) : (
            <div className="space-y-4">
              {triagedInbound.map((tp) => {
                const triage = tp.aiTriage as TriageResult;
                return (
                  <div key={tp.id} className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={INTENT_VARIANTS[triage.intent]}>
                        {INTENT_LABELS[triage.intent]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        confidence {(triage.confidence * 100).toFixed(0)}%
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {formatRelativeDate(tp.sentAt)}
                      </span>
                      {tp.subject && (
                        <span className="text-xs text-muted-foreground truncate">
                          · {tp.subject}
                        </span>
                      )}
                    </div>
                    <p className="text-sm">{triage.summary}</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Suggested:</span>{' '}
                      {triage.suggestedAction}
                    </p>
                    {triage.draftReply && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          Draft reply
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm bg-muted p-3 rounded">
                          {triage.draftReply}
                        </pre>
                      </details>
                    )}
                    <Separator />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Call Coach Reviews</CardTitle>
        </CardHeader>
        <CardContent>
          {coachedCalls.length === 0 ? (
            <p className="text-sm text-muted-foreground">{EMPTY}</p>
          ) : (
            <div className="space-y-6">
              {coachedCalls.map((call) => {
                const review = call.coachReview as CoachReview;
                return (
                  <div key={call.id} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{call.title}</span>
                      <span className="text-xs text-muted-foreground">
                        · {formatRelativeDate(call.callDate)}
                      </span>
                    </div>

                    {review.missedQuestions.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                          Missed questions
                        </p>
                        <ul className="text-sm list-disc list-inside space-y-1">
                          {review.missedQuestions.map((q, i) => (
                            <li key={i}>{q}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {review.unaddressedObjections.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                          Unaddressed objections
                        </p>
                        <ul className="text-sm space-y-2">
                          {review.unaddressedObjections.map((o, i) => (
                            <li key={i}>
                              <span className="font-medium">{o.objection}</span>
                              <p className="text-muted-foreground ml-4">
                                → {o.suggestedResponse}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {review.commitments.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                          Commitments
                        </p>
                        <ul className="text-sm list-disc list-inside space-y-1">
                          {review.commitments.map((c, i) => (
                            <li key={i}>
                              {c.description}
                              {c.suggestedDueDate && (
                                <span className="text-muted-foreground">
                                  {' '}
                                  · due {c.suggestedDueDate}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <Separator />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Meeting Prep Briefs</CardTitle>
        </CardHeader>
        <CardContent>
          {prepBriefs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{EMPTY}</p>
          ) : (
            <div className="space-y-6">
              {prepBriefs.map((reminder) => (
                <div key={reminder.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{reminder.title}</span>
                    <span className="text-xs text-muted-foreground">
                      · due {formatRelativeDate(reminder.dueDate)}
                    </span>
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {reminder.aiPrepBrief ?? ''}
                    </ReactMarkdown>
                  </div>
                  <Separator />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
