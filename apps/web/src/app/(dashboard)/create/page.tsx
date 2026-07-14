'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { useCreateProject } from '@/lib/query/hooks';
import { Button, Card, IconTile, Input, Label, Spinner } from '@/components/ui/primitives';
import { FadeUp } from '@/components/ui/motion';
import { PIPELINE_STAGES } from '@/components/pipeline/stages';

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
    <div className="relative mx-auto flex max-w-2xl flex-col items-center py-10 text-center">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-editorial-glow" />
      <FadeUp className="relative flex flex-col items-center">
        <IconTile size="lg" className="mb-6">
          <ArrowRight className="h-6 w-6 rotate-[-45deg]" />
        </IconTile>
        <h1 className="text-3xl font-semibold tracking-tightest text-fg">Brief the studio</h1>
        <p className="mt-2 max-w-md text-fg-muted">
          Give the production a name and a format. The moment you drop in a voiceover, this
          pipeline runs on its own — no editor, no timeline.
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

      {/* What happens next — the production plan, before it's real */}
      <FadeUp delay={0.14} className="mt-10 w-full">
        <p className="mb-3 text-left font-mono text-[11px] uppercase tracking-wider text-fg-subtle">
          What happens after you upload
        </p>
        <div className="overflow-hidden rounded-2xl border border-line/8 bg-surface-1 p-3 shadow-soft ring-hairline">
          <div className="flex items-stretch gap-2 overflow-x-auto">
            {PIPELINE_STAGES.map((stage, i) => {
              const Icon = stage.icon;
              return (
                <div key={stage.key} className="flex min-w-[124px] flex-1 items-center gap-2">
                  <div className="flex-1 rounded-xl border border-line/8 bg-surface-2/40 p-3 text-left">
                    <IconTile size="sm" className="mb-2">
                      <Icon className="h-3.5 w-3.5" />
                    </IconTile>
                    <p className="text-xs font-medium text-fg">{stage.label}</p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-subtle">
                      {stage.engine}
                    </p>
                  </div>
                  {i < PIPELINE_STAGES.length - 1 && (
                    <ArrowRight className="hidden h-3.5 w-3.5 shrink-0 text-fg-subtle sm:block" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </FadeUp>
    </div>
  );
}
