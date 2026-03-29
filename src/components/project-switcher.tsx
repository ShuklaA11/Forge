"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Check, Plus, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

interface Project {
  id: string;
  name: string;
  color: string;
}

const STORAGE_KEY = "leadflow_active_project";

export function ProjectSwitcher() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) return;
      const data: Project[] = await res.json();
      setProjects(data);

      const stored = localStorage.getItem(STORAGE_KEY);
      const valid = data.find((p) => p.id === stored);
      if (valid) {
        setSelectedId(valid.id);
      } else if (data.length > 0) {
        setSelectedId(data[0].id);
        localStorage.setItem(STORAGE_KEY, data[0].id);
      }
    } catch {
      // API not yet available
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  function handleSelect(projectId: string) {
    setSelectedId(projectId);
    localStorage.setItem(STORAGE_KEY, projectId);
    setOpen(false);
    router.push(`/projects/${projectId}`);
  }

  function handleNewProject() {
    setOpen(false);
    router.push("/projects/new");
  }

  const selected = projects.find((p) => p.id === selectedId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Switch project"
          aria-expanded={open}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
            "text-white/50 hover:bg-white/5 hover:text-white/80",
            open && "bg-white/5 text-white/80"
          )}
        >
          <span
            className="size-4 flex-shrink-0 rounded-sm flex items-center justify-center"
            style={{ backgroundColor: selected?.color ?? "#334155" }}
          >
            <FolderKanban className="size-2.5 text-white/80" />
          </span>
          <span className="flex-1 truncate text-left">
            {loading ? "Loading..." : selected?.name ?? "Select project"}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-white/30" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="top"
        sideOffset={6}
        className="w-56 p-0 bg-[#1a1a1a] border-white/[0.08] text-white shadow-xl"
      >
        <Command className="bg-transparent">
          <CommandInput
            placeholder="Find project..."
            className="text-white placeholder:text-white/30 h-9 text-[13px]"
          />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-[13px] text-white/40">
              No projects found.
            </CommandEmpty>
            {projects.length > 0 && (
              <CommandGroup>
                {projects.map((project) => (
                  <CommandItem
                    key={project.id}
                    value={project.name}
                    onSelect={() => handleSelect(project.id)}
                    className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] cursor-pointer text-white/70"
                  >
                    <span
                      className="size-3 flex-shrink-0 rounded-sm"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="flex-1 truncate">{project.name}</span>
                    {selectedId === project.id && (
                      <Check className="size-3.5 text-white/60 ml-auto" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator className="bg-white/[0.06]" />
            <CommandGroup>
              <CommandItem
                value="__new_project__"
                onSelect={handleNewProject}
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] cursor-pointer text-white/50"
              >
                <Plus className="size-3.5 shrink-0" />
                New Project
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
