import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const call = await prisma.call.findUnique({
    where: { id },
    include: { annotations: true, lead: { select: { firstName: true, lastName: true, company: true } } },
  });

  if (!call) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 });
  }

  return NextResponse.json(call);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const call = await prisma.call.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.callDate !== undefined && { callDate: new Date(body.callDate) }),
        ...(body.durationMinutes !== undefined && { durationMinutes: body.durationMinutes }),
        ...(body.transcript !== undefined && { transcript: body.transcript }),
        ...(body.manualNotes !== undefined && { manualNotes: body.manualNotes }),
        ...(body.structuredNotes !== undefined && { structuredNotes: body.structuredNotes }),
        ...(body.sentiment !== undefined && { sentiment: body.sentiment }),
        ...(body.sentimentScore !== undefined && { sentimentScore: body.sentimentScore }),
        ...(body.audioFilePath !== undefined && { audioFilePath: body.audioFilePath }),
      },
      include: { annotations: true },
    });

    // Update linked touchpoint body with summary if structured notes changed
    if (body.structuredNotes && call.touchpointId) {
      const summary = typeof body.structuredNotes === 'object'
        ? body.structuredNotes.summary
        : null;
      if (summary) {
        await prisma.touchpoint.update({
          where: { id: call.touchpointId },
          data: { body: summary },
        });
      }
    }

    return NextResponse.json(call);
  } catch (error) {
    console.error('Error updating call:', error);
    return NextResponse.json(
      { error: 'Failed to update call' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const call = await prisma.call.findUnique({ where: { id } });
    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    // Delete the call (annotations cascade)
    await prisma.call.delete({ where: { id } });

    // Delete the auto-created touchpoint
    if (call.touchpointId) {
      await prisma.touchpoint.delete({ where: { id: call.touchpointId } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting call:', error);
    return NextResponse.json(
      { error: 'Failed to delete call' },
      { status: 500 }
    );
  }
}
