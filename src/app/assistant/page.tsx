'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { FolderKanban } from 'lucide-react';
import { AssistantChat, ProjectContextPicker, selectedProjectBadges } from '@/components/assistant-chat';

interface Project {
  id: string;
  name: string;
  color: string;
  status: string;
}

export default function AssistantPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data: Project[]) => {
        setProjects(data.filter((p) => p.status === 'ACTIVE'));
        setInitialLoading(false);
      });
  }, []);

  function toggleProject(projectId: string) {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId],
    );
  }

  if (initialLoading) {
    return <div className="text-muted-foreground">Loading assistant...</div>;
  }

  return (
    <div className="flex h-[calc(100vh-48px)] gap-4 overflow-hidden">
      <div className="w-72 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FolderKanban className="size-4" />
              Project Context
            </div>
            <p className="text-xs text-muted-foreground">
              Select projects to give the assistant context about your leads.
            </p>
            <ProjectContextPicker
              projects={projects}
              selectedProjectIds={selectedProjectIds}
              onToggle={toggleProject}
            />
          </CardContent>
        </Card>
        {selectedProjectBadges(projects, selectedProjectIds)}
      </div>

      <div className="flex-1 min-w-0">
        <AssistantChat
          projectIds={selectedProjectIds}
          headerTitle="Lead Expert"
          headerSubtitle={
            selectedProjectIds.length === 0
              ? 'Select projects for personalized advice'
              : `${selectedProjectIds.length} project${selectedProjectIds.length > 1 ? 's' : ''} selected`
          }
        />
      </div>
    </div>
  );
}
