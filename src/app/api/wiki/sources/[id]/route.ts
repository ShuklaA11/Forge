import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const source = await prisma.wikiRawSource.findUnique({
      where: { id },
    });

    if (!source) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(source);
  } catch (error) {
    console.error('Error fetching wiki source:', error);
    return NextResponse.json(
      { error: 'Failed to fetch wiki source' },
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
    await prisma.wikiRawSource.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting wiki source:', error);
    return NextResponse.json(
      { error: 'Failed to delete wiki source' },
      { status: 500 }
    );
  }
}
