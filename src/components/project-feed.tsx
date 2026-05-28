import { prisma } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRelativeDate } from '@/lib/utils';
import { Newspaper, CheckSquare, Phone, Sparkles, ExternalLink } from 'lucide-react';
import { SaveResourceButton } from './save-resource-button';

const FEED_WINDOW_DAYS = 7;

type FeedItem =
  | { kind: 'article'; id: string; title: string; url: string | null; at: Date; alreadySaved: boolean }
  | { kind: 'task'; id: string; title: string; at: Date }
  | { kind: 'call'; id: string; title: string; leadId: string; at: Date; hasCoach: boolean }
  | { kind: 'insight'; id: string; insightKind: string; at: Date };

export async function ProjectFeed({ projectId }: { projectId: string }) {
  const now = new Date();
  const since = new Date(now.getTime() - FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [articles, tasks, calls, insights, savedResourceUrls] = await Promise.all([
    prisma.wikiRawSource.findMany({
      where: { projectId, kind: 'ARTICLE', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.task.findMany({
      where: { projectId, completed: true, updatedAt: { gte: since } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
    prisma.call.findMany({
      where: { lead: { projectId }, callDate: { gte: since } },
      orderBy: { callDate: 'desc' },
      take: 20,
    }),
    prisma.projectInsight.findMany({
      where: { projectId, generatedAt: { gte: since } },
      orderBy: { generatedAt: 'desc' },
      take: 20,
    }),
    prisma.resource
      .findMany({ where: { projectId }, select: { url: true } })
      .then((rows) => new Set(rows.map((r) => r.url))),
  ]);

  const items: FeedItem[] = [
    ...articles.map(
      (a): FeedItem => ({
        kind: 'article',
        id: a.id,
        title: a.title,
        url: a.url,
        at: a.createdAt,
        alreadySaved: a.url !== null && savedResourceUrls.has(a.url),
      }),
    ),
    ...tasks.map((t): FeedItem => ({ kind: 'task', id: t.id, title: t.title, at: t.updatedAt })),
    ...calls.map(
      (c): FeedItem => ({
        kind: 'call',
        id: c.id,
        title: c.title,
        leadId: c.leadId,
        at: c.callDate,
        hasCoach: c.coachReview !== null,
      }),
    ),
    ...insights.map(
      (i): FeedItem => ({ kind: 'insight', id: i.id, insightKind: i.kind, at: i.generatedAt }),
    ),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">This Week</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing in the last {FEED_WINDOW_DAYS} days.
          </p>
        ) : (
          items.map((item) => <FeedRow key={`${item.kind}:${item.id}`} item={item} projectId={projectId} />)
        )}
      </CardContent>
    </Card>
  );
}

function FeedRow({ item, projectId }: { item: FeedItem; projectId: string }) {
  switch (item.kind) {
    case 'article':
      return (
        <div className="flex items-start gap-2 text-sm">
          <Newspaper className="size-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0 flex-1">
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline truncate block"
              >
                {item.title}
              </a>
            ) : (
              <span className="truncate block">{item.title}</span>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>{formatRelativeDate(item.at)}</span>
              {item.url && (
                <SaveResourceButton
                  projectId={projectId}
                  url={item.url}
                  title={item.title}
                  alreadySaved={item.alreadySaved}
                />
              )}
            </div>
          </div>
        </div>
      );
    case 'task':
      return (
        <div className="flex items-start gap-2 text-sm">
          <CheckSquare className="size-3.5 mt-0.5 text-green-600 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="truncate block">Completed: {item.title}</span>
            <span className="text-xs text-muted-foreground">{formatRelativeDate(item.at)}</span>
          </div>
        </div>
      );
    case 'call':
      return (
        <div className="flex items-start gap-2 text-sm">
          <Phone className="size-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <a href={`/leads/${item.leadId}`} className="hover:underline truncate block">
              {item.title}
            </a>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>{formatRelativeDate(item.at)}</span>
              {item.hasCoach && (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">AI-reviewed</Badge>
              )}
            </div>
          </div>
        </div>
      );
    case 'insight':
      return (
        <div className="flex items-start gap-2 text-sm">
          <Sparkles className="size-3.5 mt-0.5 text-indigo-500 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="block">
              New insight: <span className="text-muted-foreground">{item.insightKind.replace(/_/g, ' ').toLowerCase()}</span>
            </span>
            <span className="text-xs text-muted-foreground">{formatRelativeDate(item.at)}</span>
          </div>
        </div>
      );
  }
}

// Re-export for icon usage by parent if needed
export { ExternalLink };
