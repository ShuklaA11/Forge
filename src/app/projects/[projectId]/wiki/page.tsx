import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { listAllLatest, readLatest } from '@/lib/wiki/store';
import { projectIndexPath } from '@/lib/wiki/paths';
import { WikiTree, RecompileButton, WikiMarkdown, type WikiTreeDoc } from '@/components/wiki-tree';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

function docTitle(doc: { path: string; frontmatter: unknown }): string {
  const fm = doc.frontmatter as { title?: unknown } | null;
  if (fm && typeof fm.title === 'string') return fm.title;
  return doc.path;
}

export default async function WikiIndexPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, wikiEnabled: true },
  });
  if (!project) notFound();

  if (!project.wikiEnabled) {
    return (
      <div className="space-y-4">
        <Link href={`/projects/${projectId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to project
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Wiki is not enabled for this project. Enable it in project settings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allDocs = await listAllLatest(projectId);
  const treeDocs: WikiTreeDoc[] = allDocs.map((d) => ({
    path: d.path,
    kind: d.kind,
    title: docTitle(d),
  }));

  const indexDoc = await readLatest(projectId, projectIndexPath());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href={`/projects/${projectId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to project
          </Button>
        </Link>
        <RecompileButton projectId={projectId} />
      </div>
      <div className="grid grid-cols-12 gap-6">
        <aside className="col-span-3">
          <Card>
            <CardContent className="pt-4">
              <h3 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
                {project.name}
              </h3>
              <WikiTree projectId={projectId} docs={treeDocs} />
            </CardContent>
          </Card>
        </aside>
        <main className="col-span-9">
          <Card>
            <CardContent className="pt-6">
              {indexDoc ? (
                <WikiMarkdown projectId={projectId} content={indexDoc.content} />
              ) : (
                <div className="py-12 text-center">
                  <p className="mb-4 text-muted-foreground">
                    No project index has been compiled yet.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Click <strong>Recompile wiki</strong> above to generate pages from
                    your leads, calls, and touchpoints.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
