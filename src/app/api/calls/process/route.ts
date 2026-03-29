import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { transcribeAudio } from '@/lib/transcription';
import { generateStructuredNotes } from '@/lib/call-notes';
import { saveCompanySummary } from '@/lib/company-summary';
import { saveProjectSummary } from '@/lib/project-summary';

const SENTIMENT_MAP: Record<string, string> = {
  very_positive: 'VERY_POSITIVE',
  positive: 'POSITIVE',
  neutral: 'NEUTRAL',
  negative: 'NEGATIVE',
  very_negative: 'VERY_NEGATIVE',
};

export async function POST(request: Request) {
  try {
    const { callId, manualOnly } = await request.json();

    if (!callId) {
      return NextResponse.json({ error: 'callId is required' }, { status: 400 });
    }

    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: {
        lead: {
          select: {
            projectId: true,
            firstName: true,
            lastName: true,
            company: true,
            title: true,
            currentStage: true,
            conversationStage: true,
          },
        },
      },
    });

    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    let transcript = call.transcript;

    // Step 1: Transcribe audio if available and not already transcribed
    if (!manualOnly && call.audioFilePath && !transcript) {
      transcript = await transcribeAudio(call.audioFilePath);
    }

    // Step 2: Generate structured notes from transcript or manual notes
    const content = transcript || call.manualNotes;
    if (!content) {
      return NextResponse.json(
        { error: 'No transcript or manual notes available to process' },
        { status: 400 }
      );
    }

    const structuredNotes = await generateStructuredNotes(
      content,
      {
        firstName: call.lead.firstName,
        lastName: call.lead.lastName,
        company: call.lead.company,
        title: call.lead.title,
        currentStage: call.lead.currentStage,
        conversationStage: call.lead.conversationStage,
      },
      !transcript && !!call.manualNotes,
    );

    // Step 3: Update the Call record
    const sentimentEnum = SENTIMENT_MAP[structuredNotes.sentiment] || 'NEUTRAL';

    const updatedCall = await prisma.call.update({
      where: { id: callId },
      data: {
        ...(transcript && { transcript }),
        structuredNotes: JSON.parse(JSON.stringify(structuredNotes)),
        sentiment: sentimentEnum as 'VERY_POSITIVE' | 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'VERY_NEGATIVE',
        sentimentScore: structuredNotes.sentimentScore,
      },
      include: { annotations: true },
    });

    // Step 4: Update linked touchpoint body with the summary
    if (updatedCall.touchpointId) {
      await prisma.touchpoint.update({
        where: { id: updatedCall.touchpointId },
        data: { body: structuredNotes.summary },
      });
    }

    // Step 5: Fire-and-forget summary regeneration
    const { projectId, company } = call.lead;
    saveCompanySummary(projectId, company)
      .then(() => saveProjectSummary(projectId))
      .catch((err) => console.error('Summary regeneration failed:', err));

    return NextResponse.json(updatedCall);
  } catch (error) {
    console.error('Error processing call:', error);
    const message = error instanceof Error ? error.message : 'Failed to process call';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
