import { buildLeadContext } from '../context';
import { personPrompt } from '../prompts';
import { personPath } from '../paths';
import { writeDoc, type WikiSource, type WriteDocResult } from '../store';
import { generateLLMResponse } from '../../llm';

export async function generate(
  projectId: string,
  leadId: string,
): Promise<WriteDocResult> {
  const ctx = await buildLeadContext(projectId, leadId);
  const { system, user } = personPrompt(ctx);

  const content = await generateLLMResponse(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    2048,
  );

  const fullName = `${ctx.lead.firstName} ${ctx.lead.lastName}`;

  const sources: WikiSource[] = [
    { type: 'lead', id: ctx.lead.id },
    ...ctx.calls.map((c) => ({ type: 'call' as const, id: c.id })),
    ...ctx.touchpoints.map((t) => ({ type: 'touchpoint' as const, id: t.id })),
  ];

  return writeDoc({
    projectId,
    path: personPath(ctx.lead.company, ctx.lead.id, fullName),
    kind: 'PERSON',
    content,
    frontmatter: { title: fullName },
    sources,
  });
}
