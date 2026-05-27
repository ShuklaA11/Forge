import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runMeetingPrep, type PrepInput } from '@/lib/agents/meeting-prep';
import { retrieveRelevantDocs } from '@/lib/wiki/retrieve';
import { retrieveRelevantResources } from '@/lib/resources/retrieve';
import { searchWeb } from '@/lib/agents/web-search';

const TOUCHPOINT_LIMIT = 10;
const WIKI_LIMIT = 6;
const RESOURCE_LIMIT = 3;
const WEB_RESULT_LIMIT = 6;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const reminder = await prisma.reminder.findUnique({
      where: { id },
      include: {
        lead: {
          include: {
            project: { select: { id: true, name: true, idea: true, approach: true } },
            touchpoints: {
              orderBy: { sentAt: 'desc' },
              take: TOUCHPOINT_LIMIT,
            },
          },
        },
      },
    });

    if (!reminder) {
      return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
    }

    const { lead } = reminder;
    const project = lead.project;

    const wikiQuery = `${lead.company} ${lead.firstName} ${lead.lastName} ${lead.title ?? ''}`;
    const wikiDocs = await retrieveRelevantDocs(project.id, wikiQuery, WIKI_LIMIT);
    const resources = await retrieveRelevantResources(project.id, wikiQuery, RESOURCE_LIMIT);

    const webResults = await searchWeb([`${lead.company} news`, `${lead.company} announcement`], {
      maxResultsPerQuery: 3,
    });

    const input: PrepInput = {
      lead: {
        firstName: lead.firstName,
        lastName: lead.lastName,
        company: lead.company,
        title: lead.title,
        currentStage: lead.currentStage,
        conversationStage: lead.conversationStage,
      },
      project: { name: project.name, idea: project.idea, approach: project.approach },
      reminder: { title: reminder.title, notes: reminder.notes, dueDate: reminder.dueDate },
      touchpoints: lead.touchpoints
        .slice()
        .reverse()
        .map((t) => ({
          channel: t.channel,
          direction: t.direction,
          subject: t.subject,
          body: t.body,
          notes: t.notes,
          occurredAt: t.sentAt,
        })),
      wikiDocs: [
        ...wikiDocs.map((d) => ({
          title: d.doc.path,
          excerpt: d.doc.content.slice(0, 600),
        })),
        ...resources.map((r) => ({
          title: `[Resource] ${r.resource.title || r.resource.url}`,
          excerpt: [
            r.resource.userNote && `Saved note: ${r.resource.userNote}`,
            r.resource.description,
            r.resource.fetchedExcerpt?.slice(0, 600),
          ]
            .filter(Boolean)
            .join('\n'),
        })),
      ],
      webResults: webResults.slice(0, WEB_RESULT_LIMIT).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
      })),
    };

    const brief = await runMeetingPrep(input);

    await prisma.reminder.update({
      where: { id },
      data: { aiPrepBrief: JSON.stringify(brief) },
    });

    return NextResponse.json({
      brief,
      sources: input.webResults,
    });
  } catch (error) {
    console.error('Error generating prep brief:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate prep';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
