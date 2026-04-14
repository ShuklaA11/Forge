import { buildCompanyContext } from '../context';
import { companyPrompt } from '../prompts';
import { companyIndexPath } from '../paths';
import { writeDoc, type WikiSource, type WriteDocResult } from '../store';
import { generateLLMResponse } from '../../llm';

export async function generate(
  projectId: string,
  companyName: string,
): Promise<WriteDocResult> {
  const ctx = await buildCompanyContext(projectId, companyName);
  const { system, user } = companyPrompt(ctx);

  const content = await generateLLMResponse(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    2048,
  );

  const sources: WikiSource[] = [
    ...ctx.leads.map((l) => ({ type: 'lead' as const, id: l.id })),
    ...ctx.calls.map((c) => ({ type: 'call' as const, id: c.id })),
    ...ctx.touchpoints.map((t) => ({ type: 'touchpoint' as const, id: t.id })),
    ...ctx.rawSources.map((s) => ({ type: 'wiki' as const, id: s.id })),
  ];

  return writeDoc({
    projectId,
    path: companyIndexPath(companyName),
    kind: 'COMPANY',
    content,
    frontmatter: { title: companyName },
    sources,
  });
}
