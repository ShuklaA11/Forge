'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Send, Loader2, Trash2, Plus, FolderKanban } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  color: string;
  status: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  messages: Message[];
}

export default function AssistantPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load projects and conversations on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/projects').then((r) => r.json()),
      fetch('/api/assistant').then((r) => r.json()),
    ]).then(([projectsData, convsData]) => {
      setProjects(projectsData.filter((p: Project) => p.status === 'ACTIVE'));
      setConversations(convsData);
      setInitialLoading(false);
    });
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function toggleProject(projectId: string) {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId]
    );
  }

  async function loadConversation(convId: string) {
    const res = await fetch(`/api/assistant?conversationId=${convId}`);
    const data = await res.json();
    if (data) {
      setActiveConversationId(data.id);
      setMessages(data.messages || []);
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

    // Optimistic UI — add user message immediately
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
          projectIds: selectedProjectIds,
          conversationId: activeConversationId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get response');
      }

      // Set conversation ID if new
      if (!activeConversationId) {
        setActiveConversationId(data.conversationId);
        setConversations((prev) => [
          { id: data.conversationId, title: userMessage.slice(0, 80), createdAt: new Date().toISOString(), messages: [] },
          ...prev,
        ]);
      }

      // Add assistant response
      const assistantMsg: Message = {
        id: `resp-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        createdAt: new Date().toISOString(),
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
    return <div className="text-muted-foreground">Loading assistant...</div>;
  }

  return (
    <div className="flex h-[calc(100vh-48px)] gap-4 overflow-hidden">
      {/* Left sidebar — conversations + project toggle */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
        {/* Project Context Toggle */}
        <Card className="bg-[#1a1a1a] border-white/[0.06]">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-white/80">
              <FolderKanban className="size-4" />
              Project Context
            </div>
            <p className="text-xs text-white/40">
              Select projects to give the assistant context about your leads.
            </p>
            <div className="space-y-1.5">
              {projects.length === 0 ? (
                <p className="text-xs text-white/30">No active projects</p>
              ) : (
                projects.map((project) => (
                  <label
                    key={project.id}
                    className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-white/5 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProjectIds.includes(project.id)}
                      onChange={() => toggleProject(project.id)}
                      className="rounded border-white/20 h-3.5 w-3.5"
                    />
                    <span
                      className="size-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="text-white/70 truncate">{project.name}</span>
                  </label>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Conversations list */}
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-medium text-white/40 uppercase tracking-wider">
              Conversations
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={startNewConversation}
              className="h-6 w-6 p-0 text-white/40 hover:text-white"
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
          {conversations.length === 0 ? (
            <p className="text-xs text-white/30 px-1">No conversations yet</p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-1 rounded-md px-2 py-1.5 cursor-pointer transition-colors ${
                  activeConversationId === conv.id
                    ? 'bg-white/10 text-white'
                    : 'text-white/50 hover:bg-white/5 hover:text-white/80'
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
                  className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-white/[0.06]">
          <div>
            <h1 className="text-xl font-bold">Lead Expert</h1>
            <p className="text-xs text-white/40">
              {selectedProjectIds.length === 0
                ? 'Select projects for personalized advice'
                : `${selectedProjectIds.length} project${selectedProjectIds.length > 1 ? 's' : ''} selected`}
            </p>
          </div>
          {selectedProjectIds.length > 0 && (
            <div className="flex gap-1.5 flex-wrap ml-auto">
              {projects
                .filter((p) => selectedProjectIds.includes(p.id))
                .map((p) => (
                  <Badge
                    key={p.id}
                    variant="outline"
                    className="text-[11px] border-white/10 text-white/60"
                  >
                    <span
                      className="size-1.5 rounded-full mr-1"
                      style={{ backgroundColor: p.color }}
                    />
                    {p.name}
                  </Badge>
                ))}
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3 max-w-md">
                <p className="text-white/30 text-sm">
                  Ask the Lead Expert about strategy, market approach, lead prioritization, or outreach tactics.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    'How should I prioritize my leads?',
                    'What outreach channels work best for SMBs?',
                    'Analyze my pipeline health',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setInput(suggestion)}
                      className="text-xs px-3 py-1.5 rounded-full border border-white/10 text-white/40 hover:bg-white/5 hover:text-white/60 transition-colors"
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
                className={`max-w-[75%] rounded-lg px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-indigo-600/30 text-white/90'
                    : 'bg-white/[0.04] text-white/80 border border-white/[0.06]'
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                <div className="text-[10px] text-white/20 mt-1.5">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-4 py-3">
                <Loader2 className="size-4 animate-spin text-white/40" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-white/[0.06] pt-4">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedProjectIds.length === 0
                  ? 'Select projects above, then ask about lead strategy...'
                  : 'Ask about lead strategy, market approach, prioritization...'
              }
              className="min-h-[44px] max-h-32 resize-none bg-white/[0.04] border-white/[0.08] text-sm"
              rows={1}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              size="icon"
              className="h-11 w-11 bg-indigo-600 hover:bg-indigo-700 flex-shrink-0"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
