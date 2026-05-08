import { NextResponse } from 'next/server';
import { discoverLeads } from '@/lib/lead-discovery';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const candidates = await discoverLeads(id);
    return NextResponse.json({ candidates });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Discovery failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
