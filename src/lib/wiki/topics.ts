import { listAllLatest } from './store';
import { topicDiscoveryPrompt } from './prompts';
import { generateLLMResponse } from '../llm';

export const FIXED_TOPICS = [
  'objections',
  'competitors',
  'icp-patterns',
  'pricing-feedback',
] as const;

export type FixedTopic = (typeof FIXED_TOPICS)[number];

export interface DiscoveredTopic {
  key: string;
  title: string;
  rationale: string;
}

const MAX_DISCOVERED = 5;

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function isDiscoveredTopic(v: unknown): v is DiscoveredTopic {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.key === 'string' &&
    obj.key.length > 0 &&
    typeof obj.title === 'string' &&
    obj.title.length > 0 &&
    typeof obj.rationale === 'string'
  );
}

export async function discoverTopics(projectId: string): Promise<DiscoveredTopic[]> {
  const docs = await listAllLatest(projectId);
  const pages = docs
    .filter((d) => !d.path.startsWith('_'))
    .map((d) => {
      const fm = d.frontmatter as { title?: unknown } | null;
      const title = typeof fm?.title === 'string' ? fm.title : d.path;
      return { path: d.path, title };
    });

  const { system, user } = topicDiscoveryPrompt(pages);
  const raw = await generateLLMResponse(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    1024,
  );

  const cleaned = stripJsonFences(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(
      `discoverTopics: failed to parse LLM response as JSON: ${(e as Error).message}. Raw: ${raw.slice(0, 300)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`discoverTopics: LLM response was not a JSON array. Got: ${typeof parsed}`);
  }

  const fixedSet = new Set<string>(FIXED_TOPICS);
  return parsed
    .filter(isDiscoveredTopic)
    .filter((t) => !fixedSet.has(t.key))
    .slice(0, MAX_DISCOVERED);
}
