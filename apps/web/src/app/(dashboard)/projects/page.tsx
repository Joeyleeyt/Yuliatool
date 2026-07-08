'use client';

import Link from 'next/link';
import { Sparkles, Film, Loader2, CircleCheck, Clapperboard } from 'lucide-react';
import { useProjects } from '@/lib/query/hooks';
import { ProjectGrid } from '@/components/dashboard/project-grid';
import { StatCard } from '@/components/dashboard/stat-card';
import { Button } from '@/components/ui/primitives';
import { FadeUp, motion, stagger, fadeUp } from '@/components/ui/motion';

export default function ProjectsPage() {
  const { data, isLoading } = useProjects();
  const projects = data?.items;
  const activeCount =
    projects?.filter((p) => !['completed', 'failed', 'created'].includes(p.status)).length ?? 0;
  const completedCount = projects?.filter((p) => p.status === 'completed').length ?? 0;
  const scenesRendered =
    projects?.reduce((sum, p) => sum + (p.completed_scenes ?? 0), 0) ?? 0;
  const hasProjects = (projects?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-8">
      <FadeUp className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tightest text-fg">Your studio</h1>
          <p className="mt-1.5 text-sm text-fg-muted">
            {activeCount
              ? `${activeCount} production${activeCount > 1 ? 's' : ''} in the studio right now.`
              : 'Every production, in one calm place.'}
          </p>
        </div>
        <Link href="/create">
          <Button variant="accent" size="lg">
            <Sparkles className="h-4 w-4" />
            Create Video
          </Button>
        </Link>
      </FadeUp>

      {(hasProjects || isLoading) && (
        <motion.div
          variants={stagger(0.05)}
          initial="hidden"
          animate="show"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <motion.div variants={fadeUp}>
            <StatCard icon={Film} label="Productions" value={projects?.length ?? 0} />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard icon={Loader2} label="In production" value={activeCount} />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard icon={CircleCheck} label="Completed" value={completedCount} />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard icon={Clapperboard} label="Scenes rendered" value={scenesRendered} />
          </motion.div>
        </motion.div>
      )}

      <div className="flex flex-col gap-5">
        <FadeUp delay={0.05}>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">
            Recent projects
          </h2>
        </FadeUp>
        <ProjectGrid projects={projects} isLoading={isLoading} />
      </div>
    </div>
  );
}
