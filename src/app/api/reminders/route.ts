import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get('leadId');
  const upcoming = searchParams.get('upcoming');

  const where: Record<string, unknown> = { completed: false };
  if (leadId) where.leadId = leadId;
  if (upcoming) {
    const daysAhead = parseInt(upcoming) || 7;
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);
    where.dueDate = { lte: futureDate };
  }

  const reminders = await prisma.reminder.findMany({
    where,
    include: {
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          company: true,
          project: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { dueDate: 'asc' },
  });

  return NextResponse.json(reminders);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { leadId, title, notes, dueDate } = body;

    if (!leadId || !title || !dueDate) {
      return NextResponse.json(
        { error: 'leadId, title, and dueDate are required' },
        { status: 400 }
      );
    }

    const reminder = await prisma.reminder.create({
      data: {
        leadId,
        title,
        notes: notes || null,
        dueDate: new Date(dueDate),
      },
    });

    return NextResponse.json(reminder, { status: 201 });
  } catch (error) {
    console.error('Error creating reminder:', error);
    return NextResponse.json(
      { error: 'Failed to create reminder' },
      { status: 500 }
    );
  }
}
