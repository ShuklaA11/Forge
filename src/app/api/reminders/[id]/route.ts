import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const reminder = await prisma.reminder.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.dueDate !== undefined && { dueDate: new Date(body.dueDate) }),
        ...(body.completed !== undefined && { completed: body.completed }),
      },
    });

    return NextResponse.json(reminder);
  } catch (error) {
    console.error('Error updating reminder:', error);
    return NextResponse.json(
      { error: 'Failed to update reminder' },
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
    await prisma.reminder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting reminder:', error);
    return NextResponse.json(
      { error: 'Failed to delete reminder' },
      { status: 500 }
    );
  }
}
