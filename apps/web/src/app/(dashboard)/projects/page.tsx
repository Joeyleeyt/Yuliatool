'use client';

import { Film, Loader2, CircleCheck, Clapperboard } from 'lucide-react';
import { useProjects } from '@/lib/query/hooks';
import { StudioHero } from '@/components/dashboard/studio-hero';
import { ProjectGrid } from '@/components/dashboard/project-grid';
import { StatCard } from '@/components/dashboard/stat-card';
import { FadeUp, motion, stagger, fadeUp } from '@/components/ui/motion';

export default function ProjectsPage() {
  const { data, isLoading } = useProjects();
  const projects = data?.items;
  const activeCount =
    projects?.filter((p) => !['completed', 'failed', 'created'].includes(p.status)).length ?? 0;
  const completedCount = projects?.filter((p) => p.status === 'completed').length ?? 0;
  const shotsGenerated =
    projects?.reduce((sum, p) => sum + (p.completed_scenes ?? 0), 0) ?? 0;
  const hasProjects = (projects?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-8">
      <StudioHero />

      {(hasProjects || isLoading) && (
        <motion.div
          variants={stagger(0.05)}
          initial="hidden"
          animate="show"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <motion.div variants={fadeUp}>
            <StatCard icon={Film} label="Films" value={projects?.length ?? 0} />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard icon={Loader2} label="In production" value={activeCount} />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard icon={CircleCheck} label="Completed" value={completedCount} />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard
              icon={Clapperboard}
              label="AI shots generated"
              value={shotsGenerated.toLocaleString()}
            />
          </motion.div>
        </motion.div>
      )}

      <div className="flex flex-col gap-5">
        <FadeUp delay={0.05} className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">
            Productions
          </h2>
          {hasProjects && (
            <span className="font-mono text-xs text-fg-subtle">
              {projects!.length} total
            </span>
          )}
        </FadeUp>
        <ProjectGrid projects={projects} isLoading={isLoading} />
      </div>
    </div>
  );
}
