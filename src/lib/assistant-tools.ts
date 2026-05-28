import { prisma } from './db';
import { NOTE_KINDS_ORDERED } from '@/types';
import type { NoteKind } from '@prisma/client';
import { fetchOg } from './og-fetch';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (projectId: string, args: unknown) => Promise<ToolResult>;
}

export type ToolResult =
  | { ok: true; summary: string; data?: unknown }
  | { ok: false; error: string };

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

const createNote: ToolDefinition = {
  name: 'create_note',
  description:
    'Save a note to the current project. Use when the user asks you to remember something, record a decision, or draft a document. Pick `kind` deliberately: NOTE for general notes, DECISION for choices made, DOC_DRAFT for prose intended as a longer document.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short title (under 80 chars)' },
      body: { type: 'string', description: 'The note content in markdown' },
      kind: {
        type: 'string',
        enum: ['NOTE', 'DECISION', 'DOC_DRAFT'],
        description: 'Kind of note. Default NOTE.',
      },
      linkedLeadId: {
        type: 'string',
        description: 'Optional lead this note is about. Omit if not lead-specific.',
      },
    },
    required: ['title', 'body'],
  },
  handler: async (projectId, args) => {
    if (typeof args !== 'object' || args === null) return { ok: false, error: 'args must be an object' };
    const a = args as Record<string, unknown>;
    const title = asString(a.title);
    const body = asString(a.body);
    if (!title) return { ok: false, error: 'title is required' };
    if (typeof a.body !== 'string') return { ok: false, error: 'body is required' };
    const kindRaw = asString(a.kind);
    const kind: NoteKind = kindRaw && (NOTE_KINDS_ORDERED as readonly string[]).includes(kindRaw)
      ? (kindRaw as NoteKind)
      : 'NOTE';
    const linkedLeadId = asString(a.linkedLeadId) ?? null;
    const note = await prisma.note.create({
      data: { projectId, title, body: body ?? '', kind, linkedLeadId },
    });
    return { ok: true, summary: `Created ${kind} "${note.title}" (id: ${note.id})`, data: { id: note.id, kind } };
  },
};

const createTask: ToolDefinition = {
  name: 'create_task',
  description:
    'Add a task to the project. Use when the user says they need to do something, or when you propose a concrete action they should take.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Concise task title' },
      notes: { type: 'string', description: 'Optional additional context' },
      dueAt: { type: 'string', description: 'Optional ISO 8601 date or datetime' },
      leadId: { type: 'string', description: 'Optional lead this task is about' },
    },
    required: ['title'],
  },
  handler: async (projectId, args) => {
    if (typeof args !== 'object' || args === null) return { ok: false, error: 'args must be an object' };
    const a = args as Record<string, unknown>;
    const title = asString(a.title);
    if (!title) return { ok: false, error: 'title is required' };
    const notes = asString(a.notes) ?? null;
    const leadId = asString(a.leadId) ?? null;
    let dueAt: Date | null = null;
    const dueAtRaw = asString(a.dueAt);
    if (dueAtRaw) {
      const parsed = new Date(dueAtRaw);
      if (isNaN(parsed.getTime())) return { ok: false, error: 'dueAt is not a valid date' };
      dueAt = parsed;
    }
    const task = await prisma.task.create({
      data: { projectId, title, notes, dueAt, leadId },
    });
    return {
      ok: true,
      summary: `Created task "${task.title}"${dueAt ? ` due ${dueAt.toISOString().slice(0, 10)}` : ''} (id: ${task.id})`,
      data: { id: task.id },
    };
  },
};

const recordMetric: ToolDefinition = {
  name: 'record_metric',
  description:
    'Record a metric data point for the project. Use when the user shares a measurable quantity worth tracking over time (e.g., MRR, reply rate, calls booked). Metrics are append-only — record a new value to update.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Metric name (e.g. "weekly_replies")' },
      value: { type: 'number', description: 'Numeric value' },
      unit: { type: 'string', description: 'Optional unit label (e.g. "USD", "%", "count")' },
      recordedAt: { type: 'string', description: 'Optional ISO 8601 datetime. Defaults to now.' },
    },
    required: ['name', 'value'],
  },
  handler: async (projectId, args) => {
    if (typeof args !== 'object' || args === null) return { ok: false, error: 'args must be an object' };
    const a = args as Record<string, unknown>;
    const name = asString(a.name);
    if (!name) return { ok: false, error: 'name is required' };
    if (typeof a.value !== 'number' || !Number.isFinite(a.value)) {
      return { ok: false, error: 'value must be a finite number' };
    }
    const unit = asString(a.unit) ?? null;
    let recordedAt: Date | undefined;
    const recordedAtRaw = asString(a.recordedAt);
    if (recordedAtRaw) {
      const parsed = new Date(recordedAtRaw);
      if (isNaN(parsed.getTime())) return { ok: false, error: 'recordedAt is not a valid date' };
      recordedAt = parsed;
    }
    const metric = await prisma.metric.create({
      data: {
        projectId,
        name,
        value: a.value,
        unit,
        ...(recordedAt ? { recordedAt } : {}),
      },
    });
    return {
      ok: true,
      summary: `Recorded ${name} = ${a.value}${unit ? ` ${unit}` : ''} (id: ${metric.id})`,
      data: { id: metric.id },
    };
  },
};

const saveResource: ToolDefinition = {
  name: 'save_resource',
  description:
    'Save a URL to the project resource library. Use when the user shares a link worth keeping, or when you reference an external source the user should track. The system fetches OG metadata automatically.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to save' },
      userNote: {
        type: 'string',
        description: "Optional short note on why this resource matters. This is weighted heavily by retrieval — write what's useful.",
      },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional free-form tags' },
    },
    required: ['url'],
  },
  handler: async (projectId, args) => {
    if (typeof args !== 'object' || args === null) return { ok: false, error: 'args must be an object' };
    const a = args as Record<string, unknown>;
    const urlRaw = asString(a.url);
    if (!urlRaw) return { ok: false, error: 'url is required' };
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlRaw);
    } catch {
      return { ok: false, error: 'url is not a valid URL' };
    }
    const userNote = asString(a.userNote) ?? null;
    const tags = Array.isArray(a.tags)
      ? a.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter((t) => t.length > 0)
      : [];

    const og = await fetchOg(parsedUrl.toString());
    const resource = await prisma.resource.create({
      data: {
        projectId,
        url: parsedUrl.toString(),
        title: og.title ?? null,
        description: og.description ?? null,
        ogImage: og.ogImage ?? null,
        fetchedExcerpt: og.fetchedExcerpt ?? null,
        userNote,
        tags,
      },
    });
    return {
      ok: true,
      summary: `Saved resource "${resource.title || resource.url}" (id: ${resource.id})`,
      data: { id: resource.id },
    };
  },
};

export const ASSISTANT_TOOLS: ToolDefinition[] = [createNote, createTask, recordMetric, saveResource];

export function findTool(name: string): ToolDefinition | undefined {
  return ASSISTANT_TOOLS.find((t) => t.name === name);
}
