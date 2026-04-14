import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { listAllLatest, readLatest, readVersion, getBacklinks, getHistory } from '@/lib/wiki/store';
import { WikiTree, RecompileButton, WikiMarkdown, type WikiTreeDoc } from '@/components/wiki-tree';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';

function docTitle(doc: { path: string; frontmatter: unknown }): string {
  const fm = doc.frontmatter as { title?: unknown } | null;
  if (fm && typeof fm.title === 'string') return fm.title;
  return doc.path;
}

export default async function WikiDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; path: string[] }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { projectId, path } = await params;
  const { version } = await searchParams;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, wikiEnabled: true },
  });
  if (!project) notFound();
  if (!project.wikiEnabled) notFound();

  const fullPath = path.join('/');

  const requestedVersion = version ? parseInt(version, 10) : null;
  const doc =
    requestedVersion && !Number.isNaN(requestedVersion)
      ? await readVersion(projectId, fullPath, requestedVersion)
      : await readLatest(projectId, fullPath);

  if (!doc) notFound();

  const [allDocs, backlinks, history] = await Promise.all([
    listAllLatest(projectId),
    getBacklinks(projectId, fullPath),
    getHistory(projectId, fullPath),
  ]);

  const treeDocs: WikiTreeDoc[] = allDocs.map((d) => ({
    path: d.path,
    kind: d.kind,
    title: docTitle(d),
  }));

  const title = docTitle(doc);
  const isOldVersion = requestedVersion !== null && history.length > 0 && requestedVersion < history[history.length - 1].version;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href={`/projects/${projectId}/wiki`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Wiki home
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
              <WikiTree projectId={projectId} docs={treeDocs} currentPath={fullPath} />
            </CardContent>
          </Card>
        </aside>
        <main className="col-span-9 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-xl">{title}</CardTitle>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{fullPath}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{doc.kind.replace('_', ' ').toLowerCase()}</Badge>
                <Badge variant="secondary">v{doc.version}</Badge>
                {isOldVersion && <Badge variant="destructive">old version</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <WikiMarkdown projectId={projectId} content={doc.content} />
            </CardContent>
          </Card>

          {history.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Version history</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {history
                    .slice()
                    .reverse()
                    .map((h) => {
                      const isCurrent = h.version === doc.version;
                      const href =
                        h.version === history[history.length - 1].version
                          ? `/projects/${projectId}/wiki/${fullPath}`
                          : `/projects/${projectId}/wiki/${fullPath}?version=${h.version}`;
                      return (
                        <li key={h.id}>
                          <Link
                            href={href}
                            className={`block rounded px-2 py-1 hover:bg-muted ${
                              isCurrent ? 'bg-muted font-medium' : 'text-muted-foreground'
                            }`}
                          >
                            v{h.version} — {new Date(h.generatedAt).toLocaleString()}
                          </Link>
                        </li>
                      );
                    })}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Backlinks ({backlinks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {backlinks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No other pages link here yet.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {backlinks.map((b) => (
                    <li key={b.id}>
                      <Link
                        href={`/projects/${projectId}/wiki/${b.path}`}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {docTitle(b)}
                      </Link>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {b.path}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
