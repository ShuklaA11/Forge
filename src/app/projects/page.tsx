import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, FolderKanban } from 'lucide-react';

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    where: { status: 'ACTIVE' },
    include: { _count: { select: { leads: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground">Organize your outreach campaigns</p>
        </div>
        <Link href="/projects/new">
          <Button><Plus className="mr-2 h-4 w-4" /> New Project</Button>
        </Link>
      </div>

      {projects.length === 0 ? (
        <Card className="p-12 text-center">
          <FolderKanban className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
          <p className="text-muted-foreground mb-4">Create your first project to start managing leads.</p>
          <Link href="/projects/new"><Button>Create Project</Button></Link>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                  </div>
                  {project.description && <CardDescription>{project.description}</CardDescription>}
                </CardHeader>
                <CardContent>
                  <Badge variant="secondary">{project._count.leads} lead{project._count.leads !== 1 ? 's' : ''}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
