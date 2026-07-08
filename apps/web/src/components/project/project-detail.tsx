'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2, RotateCw } from 'lucide-react';
import { useProject, useDeleteProject, useRetryProject } from '@/lib/query/hooks';
import { StatusBadge } from '@/components/status-badge';
import { UploadZone } from '@/components/upload/upload-zone';
import { PipelineFlow } from '@/components/pipeline/pipeline-flow';
import { CostSummary } from '@/components/pipeline/cost-summary';
import { ScenesView } from './scenes-view';
import { TranscriptView } from './transcript-view';
import { AssetsView } from './assets-view';
import { ActivityView } from './activity-view';
import { VideoPlayer } from '@/components/video/video-player';
import { Button, Skeleton } from '@/components/ui/primitives';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FadeUp } from '@/components/ui/motion';
import { useToast } from '@/components/ui/toast';

export function ProjectDetail({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { data, isLoading } = useProject(id);
  const del = useDeleteProject();
  const retry = useRetryProject(id);

  const onRetry = () =>
    retry.mutate(undefined, {
      onSuccess: () => toast.info('Resuming production', 'Retrying from the last safe checkpoint — no double charges.'),
      onError: (e) => toast.error('Retry failed', (e as Error).message),
    });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const project = data?.project;
  if (!project) return <p className="text-fg-muted">Project not found.</p>;

  const awaitingAudio = project.status === 'created' || project.status === 'uploading_audio';
  const completed = project.status === 'completed';

  const onDelete = async () => {
    if (!confirm('Delete this project and all its assets? This cannot be undone.')) return;
    try {
      await del.mutateAsync(id);
      toast.success('Project deleted', 'The production and its assets were removed.');
      router.push('/projects');
    } catch (e) {
      toast.error('Could not delete', (e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <FadeUp>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-fg-subtle transition-colors hover:text-fg"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Projects
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tightest text-fg">{project.title}</h1>
            <StatusBadge status={project.status} />
          </div>
          <div className="flex items-center gap-2">
            {project.status === 'failed' && (
              <Button size="sm" onClick={onRetry} disabled={retry.isPending}>
                <RotateCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => void onDelete()} disabled={del.isPending}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      </FadeUp>

      {awaitingAudio ? (
        <FadeUp delay={0.05} className="py-6">
          <UploadZone projectId={id} />
        </FadeUp>
      ) : (
        <FadeUp delay={0.05} className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-6">
            {completed && <VideoPlayer id={id} title={project.title} />}
            <PipelineFlow id={id} createdAt={project.created_at} />
          </div>
          <aside className="flex flex-col gap-6">
            <CostSummary id={id} />
          </aside>
        </FadeUp>
      )}

      {/* Detail views */}
      {!awaitingAudio && (
        <FadeUp delay={0.1}>
          <Tabs defaultValue="scenes">
            <TabsList>
              <TabsTrigger value="scenes">Scenes</TabsTrigger>
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
              <TabsTrigger value="assets">Assets</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="scenes">
              <ScenesView id={id} />
            </TabsContent>
            <TabsContent value="transcript">
              <TranscriptView id={id} />
            </TabsContent>
            <TabsContent value="assets">
              <AssetsView id={id} />
            </TabsContent>
            <TabsContent value="activity">
              <ActivityView id={id} />
            </TabsContent>
          </Tabs>
        </FadeUp>
      )}
    </div>
  );
}
