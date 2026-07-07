'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateProject } from '@/lib/query/hooks';
import { Dialog } from '@/components/ui/dialog';
import { Button, Input, Label, Textarea, Spinner } from '@/components/ui/primitives';

export function CreateProjectDialog() {
  const router = useRouter();
  const create = useCreateProject();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState<'vertical_1080x1920' | 'horizontal_1920x1080'>('vertical_1080x1920');

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await create.mutateAsync({
      title: title.trim() || 'Untitled project',
      ...(description.trim() ? { description: description.trim() } : {}),
      renderFormat: format,
    });
    setOpen(false);
    setTitle('');
    setDescription('');
    router.push(`/projects/${res.project.id}`);
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>New project</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Create project">
        <form onSubmit={onCreate} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My luxury story" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="format">Format</Label>
            <select
              id="format"
              value={format}
              onChange={(e) => setFormat(e.target.value as typeof format)}
              className="h-10 rounded-md border border-neutral-300 bg-transparent px-3 text-sm dark:border-neutral-700"
            >
              <option value="vertical_1080x1920">Vertical 1080×1920 (Shorts)</option>
              <option value="horizontal_1920x1080">Horizontal 1920×1080</option>
            </select>
          </div>
          {create.isError && <p className="text-sm text-red-600">{(create.error as Error).message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Spinner /> : 'Create'}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
