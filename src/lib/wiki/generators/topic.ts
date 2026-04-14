import { buildTopicContext } from '../context';
import { topicPrompt } from '../prompts';
import { topicPath } from '../paths';
import { writeDoc, type WikiSource, type WriteDocResult } from '../store';
import { generateLLMResponse } from '../../llm';

function humanizeTopicKey(key: string): string {
  return key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function emptyStubContent(topicKey: string): string {
  const title = humanizeTopicKey(topicKey);
  return `# ${title}\n\n_No mentions yet in this project._`;
}

export async function generate(
  projectId: string,
  topicKey: string,
): Promise<WriteDocResult> {
  const ctx = await buildTopicContext(projectId, topicKey);
  const title = humanizeTopicKey(topicKey);

  const sharedWriteArgs = {
    projectId,
    path: topicPath(topicKey),
    kind: 'TOPIC' as const,
    frontmatter: { title },
  };

  if (ctx.matches.length === 0) {
    return writeDoc({
      ...sharedWriteArgs,
      content: emptyStubContent(topicKey),
      sources: [{ type: 'project', id: projectId }],
    });
  }

  const { system, user } = topicPrompt(ctx);
  const content = await generateLLMResponse(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    2048,
  );

  const sources: WikiSource[] = [
    { type: 'project', id: projectId },
    ...ctx.matches.map((m) => ({ type: 'call' as const, id: m.call.id })),
  ];

  return writeDoc({ ...sharedWriteArgs, content, sources });
}
