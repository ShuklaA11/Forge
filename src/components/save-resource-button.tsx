'use client';

import { useState } from 'react';
import { Check, BookmarkPlus, Loader2 } from 'lucide-react';

interface SaveResourceButtonProps {
  projectId: string;
  url: string;
  title?: string | null;
  alreadySaved?: boolean;
}

export function SaveResourceButton({
  projectId,
  url,
  title,
  alreadySaved = false,
}: SaveResourceButtonProps) {
  const [saved, setSaved] = useState(alreadySaved);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (saved || saving) return;
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/resources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title }),
    });
    setSaving(false);
    if (res.ok) setSaved(true);
  }

  if (saved) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-green-600">
        <Check className="size-3" /> Saved
      </span>
    );
  }

  return (
    <button
      onClick={handleSave}
      disabled={saving}
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
    >
      {saving ? <Loader2 className="size-3 animate-spin" /> : <BookmarkPlus className="size-3" />}
      Save
    </button>
  );
}
