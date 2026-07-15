'use client';

import Link from 'next/link';
import { Film, Sparkles, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ProjectListRow } from '@/lib/api/types';
import { ProjectCard } from './project-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button, Skeleton } from '@/components/ui/primitives';
import { stagger, fadeUp } from '@/components/ui/motion';

const AUTOMATED_STEPS = [
  'Transcribe',
  'Understand the story',
  'Write the screenplay',
  'Design cinematic scenes',
  'Generate AI footage',
  'Edit',
  'Color grade',
  'Export MP4',
];

export function ProjectGrid({
  projects,
  isLoading,
}: {
  projects?: ProjectListRow[] | undefined;
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
        title="Create your first AI film."
        description={
          <>
            <p>Upload one narration. We&apos;ll automatically:</p>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-left">
              {AUTOMATED_STEPS.map((step) => (
                <li key={step} className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                  {step}
                </li>
              ))}
            </ul>
          </>
        }
        action={
          <Link href="/create">
            <Button variant="accent">
              <Sparkles className="h-4 w-4" />
              Upload Narration
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
