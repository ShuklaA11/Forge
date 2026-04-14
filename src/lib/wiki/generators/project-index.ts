import { buildProjectContext } from '../context';
import { projectIndexPrompt } from '../prompts';
import { projectIndexPath } from '../paths';
import { writeDoc, type WikiSource, type WriteDocResult } from '../store';
import { generateLLMResponse } from '../../llm';

export async function generate(projectId: string): Promise<WriteDocResult> {
  const ctx = await buildProjectContext(projectId);
  const { system, user } = projectIndexPrompt(ctx);

  const content = await generateLLMResponse(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    2048,
  );

  const sources: WikiSource[] = [
    { type: 'project', id: projectId },
    ...ctx.rawSources.map((s) => ({ type: 'wiki' as const, id: s.id })),
  ];

  return writeDoc({
    projectId,
    path: projectIndexPath(),
    kind: 'PROJECT_INDEX',
    content,
    frontmatter: { title: ctx.project.name },
    sources,
  });
}
