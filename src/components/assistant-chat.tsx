'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Send, Loader2, Trash2, Plus, Check, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ASSISTANT_PERSONAS_ORDERED,
  ASSISTANT_PERSONA_LABELS,
  type AssistantPersona,
} from '@/types';

interface Source {
  projectId: string;
  projectName: string;
  docId: string;
  path: string;
  title: string;
  score: number;
}

interface ToolCall {
  name: string;
  args: unknown;
  result: { ok: true; summary: string } | { ok: false; error: string };
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  projectIds?: string[] | null;
  sources?: Source[] | null;
  toolCalls?: ToolCall[] | null;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  persona?: AssistantPersona | string;
  messages: Message[];
}

interface AssistantChatProps {
  projectIds: string[];
  filterConversationsByProjectId?: string;
  headerTitle?: string;
  headerSubtitle?: string;
  emptyStatePrompt?: string;
  suggestions?: string[];
  showConversationList?: boolean;
}

export function AssistantChat({
  projectIds,
  filterConversationsByProjectId,
  headerTitle = 'Lead Expert',
  headerSubtitle,
  emptyStatePrompt = 'Ask the Lead Expert about strategy, market approach, lead prioritization, or outreach tactics.',
  suggestions = [
    'How should I prioritize my leads?',
    'What outreach channels work best for SMBs?',
    'Analyze my pipeline health',
  ],
  showConversationList = true,
}: AssistantChatProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [persona, setPersona] = useState<AssistantPersona>('LEAD_EXPERT');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/assistant').then((r) => r.json()).then((data) => {
      const filtered = filterConversationsByProjectId
        ? data.filter((c: Conversation) => {
            const ids = c.messages[0]?.projectIds;
            return Array.isArray(ids) && ids.includes(filterConversationsByProjectId);
          })
        : data;
      setConversations(filtered);
      setInitialLoading(false);
    });
  }, [filterConversationsByProjectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadConversation(convId: string) {
    const res = await fetch(`/api/assistant?conversationId=${convId}`);
    const data = await res.json();
    if (data) {
      setActiveConversationId(data.id);
      setMessages(data.messages || []);
      if (data.persona && (ASSISTANT_PERSONAS_ORDERED as readonly string[]).includes(data.persona)) {
        setPersona(data.persona as AssistantPersona);
      }
    }
  }

  function startNewConversation() {
    setActiveConversationId(null);
    setMessages([]);
  }

  async function deleteConversation(convId: string) {
    await fetch(`/api/assistant/${convId}`, { method: 'DELETE' });
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (activeConversationId === convId) {
      setActiveConversationId(null);
      setMessages([]);
    }
  }

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');

    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessage,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setLoading(true);

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          projectIds,
          conversationId: activeConversationId,
          persona,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get response');

      if (!activeConversationId) {
        setActiveConversationId(data.conversationId);
        setConversations((prev) => [
          { id: data.conversationId, title: userMessage.slice(0, 80), createdAt: new Date().toISOString(), messages: [] },
          ...prev,
        ]);
      }

      const assistantMsg: Message = {
        id: `resp-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        createdAt: new Date().toISOString(),
        sources: data.sources ?? null,
        toolCalls: data.toolCalls ?? null,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (initialLoading) {
    return <div className="text-muted-foreground text-sm">Loading assistant...</div>;
  }

  return (
    <div className="flex h-full gap-4 overflow-hidden">
      {showConversationList && (
        <div className="w-60 flex-shrink-0 flex flex-col gap-2 overflow-y-auto">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Conversations
            </span>
            <Button variant="ghost" size="sm" onClick={startNewConversation} className="h-6 w-6 p-0">
              <Plus className="size-3.5" />
            </Button>
          </div>
          {conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1">No conversations yet</p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-1 rounded-md px-2 py-1.5 cursor-pointer transition-colors ${
                  activeConversationId === conv.id
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50'
                }`}
                onClick={() => loadConversation(conv.id)}
              >
                <span className="text-xs truncate flex-1">{conv.title}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                  className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:text-red-500"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between gap-3 pb-3 border-b">
          <div>
            <h2 className="text-lg font-semibold">{headerTitle}</h2>
            {headerSubtitle && <p className="text-xs text-muted-foreground">{headerSubtitle}</p>}
          </div>
          <Select value={persona} onValueChange={(v) => setPersona(v as AssistantPersona)}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSISTANT_PERSONAS_ORDERED.map((p) => (
                <SelectItem key={p} value={p} className="text-xs">
                  {ASSISTANT_PERSONA_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3 max-w-md">
                <p className="text-muted-foreground text-sm">{emptyStatePrompt}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setInput(suggestion)}
                      className="text-xs px-3 py-1.5 rounded-full border text-muted-foreground hover:bg-muted transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-indigo-600/20 border border-indigo-500/30'
                    : 'bg-muted/40 border'
                }`}
              >
                {msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {msg.toolCalls.map((tc, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-1.5 text-xs rounded px-2 py-1 ${
                          tc.result.ok
                            ? 'bg-green-500/10 text-green-700 dark:text-green-300'
                            : 'bg-red-500/10 text-red-700 dark:text-red-300'
                        }`}
                      >
                        {tc.result.ok ? (
                          <Check className="size-3 mt-0.5 flex-shrink-0" />
                        ) : (
                          <X className="size-3 mt-0.5 flex-shrink-0" />
                        )}
                        <span>
                          <span className="font-medium">{tc.name}</span>
                          {' · '}
                          {tc.result.ok ? tc.result.summary : tc.result.error}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2.5 pt-2.5 border-t space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Sources
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.sources.map((s) => (
                        <a
                          key={s.docId}
                          href={`/projects/${s.projectId}/wiki/${s.path.split('/').map(encodeURIComponent).join('/')}`}
                          className="text-[11px] px-2 py-0.5 rounded border hover:bg-muted/50 transition-colors"
                          title={`${s.projectName} · ${s.path}`}
                        >
                          {s.title}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground mt-1.5">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted/40 border rounded-lg px-4 py-3">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="border-t pt-3">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                projectIds.length === 0
                  ? 'Select project context above, then ask...'
                  : 'Ask anything about this project...'
              }
              className="min-h-[44px] max-h-32 resize-none text-sm"
              rows={1}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || loading || projectIds.length === 0}
              size="icon"
              className="h-11 w-11 flex-shrink-0"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProjectContextPicker({
  projects,
  selectedProjectIds,
  onToggle,
}: {
  projects: { id: string; name: string; color: string }[];
  selectedProjectIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Project Context
      </div>
      {projects.length === 0 ? (
        <p className="text-xs text-muted-foreground">No active projects</p>
      ) : (
        <div className="space-y-1">
          {projects.map((project) => (
            <label
              key={project.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={selectedProjectIds.includes(project.id)}
                onChange={() => onToggle(project.id)}
                className="h-3.5 w-3.5"
              />
              <span
                className="size-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: project.color }}
              />
              <span className="truncate">{project.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function selectedProjectBadges(
  projects: { id: string; name: string; color: string }[],
  selectedProjectIds: string[],
) {
  if (selectedProjectIds.length === 0) return null;
  return (
    <div className="flex gap-1.5 flex-wrap">
      {projects
        .filter((p) => selectedProjectIds.includes(p.id))
        .map((p) => (
          <Badge key={p.id} variant="outline" className="text-[11px]">
            <span className="size-1.5 rounded-full mr-1" style={{ backgroundColor: p.color }} />
            {p.name}
          </Badge>
        ))}
    </div>
  );
}
