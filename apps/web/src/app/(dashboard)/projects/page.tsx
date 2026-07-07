'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useProjects } from '@/lib/query/hooks';
import { ProjectGrid } from '@/components/dashboard/project-grid';
import { Button } from '@/components/ui/primitives';
import { FadeUp } from '@/components/ui/motion';

export default function ProjectsPage() {
  const { data, isLoading } = useProjects();
  const projects = data?.items;
  const activeCount = projects?.filter(
    (p) => !['completed', 'failed', 'created'].includes(p.status),
  ).length;

  return (
    <div className="flex flex-col gap-8">
      <FadeUp className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tightest text-fg">Recent projects</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {activeCount
              ? `${activeCount} production${activeCount > 1 ? 's' : ''} in the studio right now.`
              : 'Your AI film studio — every production in one place.'}
          </p>
        </div>
        <Link href="/create">
          <Button variant="accent">
            <Sparkles className="h-4 w-4" />
            Create Video
          </Button>
        </Link>
      </FadeUp>

      <ProjectGrid projects={projects} isLoading={isLoading} />
    </div>
  );
}
