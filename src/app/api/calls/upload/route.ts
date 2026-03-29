import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const ALLOWED_TYPES = [
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mpeg',
  'audio/wav',
  'audio/webm',
  'video/mp4',
  'video/webm',
];

const MAX_SIZE = 25 * 1024 * 1024; // 25MB (Whisper API limit)

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const leadId = formData.get('leadId') as string | null;

    if (!file || !leadId) {
      return NextResponse.json(
        { error: 'file and leadId are required' },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is 25MB (Whisper API limit). Got ${(file.size / 1024 / 1024).toFixed(1)}MB.` },
        { status: 400 }
      );
    }

    // Allow common audio/video types; be lenient since MIME detection varies
    const ext = path.extname(file.name).toLowerCase();
    const allowedExts = ['.m4a', '.mp4', '.mp3', '.wav', '.webm'];
    if (!allowedExts.includes(ext) && !ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type. Allowed: ${allowedExts.join(', ')}` },
        { status: 400 }
      );
    }

    const uploadsDir = path.join(process.cwd(), 'uploads', leadId);
    await mkdir(uploadsDir, { recursive: true });

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${timestamp}-${safeName}`;
    const filePath = path.join(uploadsDir, fileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    return NextResponse.json({
      filePath,
      fileName,
      size: file.size,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
