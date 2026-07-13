'use client';

import Link from 'next/link';
import { Film, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ProjectRow } from '@/lib/api/types';
import { ProjectCard } from './project-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button, Skeleton } from '@/components/ui/primitives';
import { stagger, fadeUp } from '@/components/ui/motion';

export function ProjectGrid({
  projects,
  isLoading,
}: {
  projects?: ProjectRow[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-line/8 bg-surface-1">
            <Skeleton className="aspect-video w-full rounded-none" />
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <EmptyState
        icon={Film}
        title="No productions yet"
        description="Upload a voiceover and watch the AI studio direct your first cinematic film."
        action={
          <Link href="/create">
            <Button variant="accent">
              <Sparkles className="h-4 w-4" />
              Create your first video
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <motion.div
      variants={stagger(0.05)}
      initial="hidden"
      animate="show"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {projects.map((p) => (
        <motion.div key={p.id} variants={fadeUp}>
          <ProjectCard project={p} />
        </motion.div>
      ))}
    </motion.div>
  );
}
