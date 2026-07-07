'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useCreateProject } from '@/lib/query/hooks';
import { Button, Card, Input, Label, Spinner } from '@/components/ui/primitives';
import { FadeUp } from '@/components/ui/motion';

const FORMATS = [
  { value: 'vertical_1080x1920', label: 'Vertical', hint: '1080×1920 · Shorts / Reels' },
  { value: 'horizontal_1920x1080', label: 'Horizontal', hint: '1920×1080 · YouTube' },
] as const;

export default function CreatePage() {
  const router = useRouter();
  const create = useCreateProject();
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<(typeof FORMATS)[number]['value']>('vertical_1080x1920');

  const onLaunch = async () => {
    const res = await create.mutateAsync({
      title: title.trim() || 'Untitled production',
      renderFormat: format,
    });
    router.push(`/projects/${res.project.id}`);
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-10 text-center">
      <FadeUp className="flex flex-col items-center">
        <div className="mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-accent-soft to-accent shadow-glow">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tightest text-fg">Start a new production</h1>
        <p className="mt-2 max-w-md text-fg-muted">
          Name your film and choose a format. Next you&apos;ll drop in a voiceover and watch the AI
          studio build the movie.
        </p>
      </FadeUp>

      <FadeUp delay={0.08} className="mt-8 w-full">
        <Card className="p-6 text-left">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Project title</Label>
            <Input
              id="title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Midnight in Monaco"
              onKeyDown={(e) => e.key === 'Enter' && void onLaunch()}
            />
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <Label>Format</Label>
            <div className="grid grid-cols-2 gap-3">
              {FORMATS.map((f) => {
                const active = format === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFormat(f.value)}
                    className={[
                      'rounded-xl border p-4 text-left transition-all',
                      active
                        ? 'border-accent/40 bg-accent/8 ring-1 ring-inset ring-accent/30'
                        : 'border-line/10 bg-surface-2/40 hover:border-line/20',
                    ].join(' ')}
                  >
                    <div className="text-sm font-medium text-fg">{f.label}</div>
                    <div className="mt-0.5 text-xs text-fg-subtle">{f.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {create.isError && (
            <p className="mt-4 text-sm text-danger">{(create.error as Error).message}</p>
          )}

          <Button
            variant="accent"
            size="lg"
            className="mt-6 w-full"
            disabled={create.isPending}
            onClick={() => void onLaunch()}
          >
            {create.isPending ? <Spinner /> : <>Launch production <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </Card>
      </FadeUp>
    </div>
  );
}
