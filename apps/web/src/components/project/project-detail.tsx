'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProject, useDeleteProject, useRetryProject } from '@/lib/query/hooks';
import { StatusBadge } from '@/components/status-badge';
import { StatusProgress } from './status-progress';
import { UploadVoiceover } from './upload-voiceover';
import { TranscriptView } from './transcript-view';
import { ScenesView } from './scenes-view';
import { AssetsView } from './assets-view';
import { RenderView } from './render-view';
import { ActivityView } from './activity-view';
import { Button, Skeleton } from '@/components/ui/primitives';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export function ProjectDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data, isLoading } = useProject(id);
  const del = useDeleteProject();
  const retry = useRetryProject(id);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  const project = data?.project;
  if (!project) return <p className="text-neutral-500">Project not found.</p>;

  const canUpload = project.status === 'created' || project.status === 'uploading_audio';

  const onDelete = async () => {
    if (!confirm('Delete this project and all its assets? This cannot be undone.')) return;
    await del.mutateAsync(id);
    router.push('/projects');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/projects" className="text-sm text-neutral-500 hover:underline">
            ← Projects
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
            <StatusBadge status={project.status} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {project.status === 'failed' && (
            <Button size="sm" onClick={() => retry.mutate()} disabled={retry.isPending}>
              Retry
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={() => void onDelete()} disabled={del.isPending}>
            Delete
          </Button>
        </div>
      </div>

      <StatusProgress id={id} />
      {canUpload && <UploadVoiceover id={id} />}

      <Tabs defaultValue="scenes">
        <TabsList>
          <TabsTrigger value="scenes">Scenes</TabsTrigger>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="render">Render</TabsTrigger>
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
        <TabsContent value="render">
          <RenderView id={id} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityView id={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
