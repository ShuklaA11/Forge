'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    llmProvider: 'anthropic',
    llmApiKey: '',
    openaiApiKey: '',
    webSearchEnabled: false,
    defaultMaxTouchpoints: 5,
    defaultIntervalDays: 3,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then((res) => res.json()).then((data) => {
      if (data) setSettings(data);
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return <div className="text-muted-foreground">Loading settings...</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure your lead management system</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>LLM Configuration</CardTitle>
          <CardDescription>Configure AI-powered message drafting and lead research</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={settings.llmProvider} onValueChange={(v) => setSettings((s) => ({ ...s, llmProvider: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                <SelectItem value="openai">OpenAI (GPT-4)</SelectItem>
                <SelectItem value="ollama">Ollama (Local)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {settings.llmProvider !== 'ollama' ? (
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input type="password" value={settings.llmApiKey} onChange={(e) => setSettings((s) => ({ ...s, llmApiKey: e.target.value }))} placeholder={settings.llmProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'} />
              <p className="text-xs text-muted-foreground">Your API key is stored locally and never shared.</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Ollama runs locally — no API key needed. Make sure Ollama is running on port 11434 with a model pulled (e.g. <code className="text-xs bg-muted px-1 py-0.5 rounded">ollama pull qwen3.5:4b</code>).</p>
          )}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label>Web Search</Label>
              <p className="text-xs text-muted-foreground">
                Let AI search the web (DuckDuckGo) when drafting messages or researching leads.
                {settings.llmProvider !== 'ollama' && ' Currently only supported with Ollama.'}
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.webSearchEnabled}
              onChange={(e) => setSettings((s) => ({ ...s, webSearchEnabled: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Voice & Transcription</CardTitle>
          <CardDescription>Configure audio transcription for call recordings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>OpenAI API Key (for Whisper transcription)</Label>
            <Input
              type="password"
              value={settings.openaiApiKey}
              onChange={(e) => setSettings((s) => ({ ...s, openaiApiKey: e.target.value }))}
              placeholder="sk-..."
            />
            <p className="text-xs text-muted-foreground">
              {settings.llmProvider === 'openai'
                ? 'Since your LLM provider is OpenAI, Whisper will use your LLM API key if this field is empty.'
                : 'Required for transcribing call recordings. Whisper always uses OpenAI regardless of your LLM provider.'}
              {' '}Cost: ~$0.12 per 20-minute call.
            </p>
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <Label className="text-sm">Supported formats</Label>
            <p className="text-xs text-muted-foreground">m4a (iPhone voice memos), mp4 (Zoom/Google Meet), mp3, wav, webm — max 25MB per file.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outreach Defaults</CardTitle>
          <CardDescription>Default settings for outreach sequences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max Touchpoints per Lead</Label>
              <Input type="number" min={1} max={20} value={settings.defaultMaxTouchpoints} onChange={(e) => setSettings((s) => ({ ...s, defaultMaxTouchpoints: parseInt(e.target.value) || 5 }))} />
            </div>
            <div className="space-y-2">
              <Label>Days Between Follow-ups</Label>
              <Input type="number" min={1} max={30} value={settings.defaultIntervalDays} onChange={(e) => setSettings((s) => ({ ...s, defaultIntervalDays: parseInt(e.target.value) || 3 }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}</Button>
    </div>
  );
}
