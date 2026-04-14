import { buildCallContext } from '../context';
import { callPrompt } from '../prompts';
import { callPath } from '../paths';
import { writeDoc, type WikiSource, type WriteDocResult } from '../store';
import { generateLLMResponse } from '../../llm';

export async function generate(
  projectId: string,
  callId: string,
): Promise<WriteDocResult> {
  const ctx = await buildCallContext(projectId, callId);
  const { system, user } = callPrompt(ctx);

  const content = await generateLLMResponse(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    2048,
  );

  const sources: WikiSource[] = [
    { type: 'call', id: ctx.call.id },
    { type: 'lead', id: ctx.lead.id },
  ];

  return writeDoc({
    projectId,
    path: callPath(ctx.lead.company, ctx.call.id, ctx.call.callDate, ctx.call.title),
    kind: 'CALL',
    content,
    frontmatter: { title: ctx.call.title },
    sources,
  });
}
