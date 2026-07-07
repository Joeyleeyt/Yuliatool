'use client';

import Link from 'next/link';
import { useProjects } from '@/lib/query/hooks';
import { CreateProjectDialog } from '@/components/projects/create-project-dialog';
import { StatusBadge } from '@/components/status-badge';
import { Card, CardContent, Skeleton } from '@/components/ui/primitives';

export default function ProjectsPage() {
  const { data, isLoading } = useProjects();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <CreateProjectDialog />
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-neutral-500">
            No projects yet. Create one and upload a voiceover to begin.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {data.items.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="transition-colors hover:border-neutral-400 dark:hover:border-neutral-600">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.title}</p>
                    <p className="text-sm text-neutral-500">
                      {new Date(p.created_at).toLocaleString()} · {p.total_scenes} scenes
                    </p>
                  </div>
                  <StatusBadge status={p.status} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
