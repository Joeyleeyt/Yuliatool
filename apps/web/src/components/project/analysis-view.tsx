'use client';

import { Brain, Palette } from 'lucide-react';
import { useAnalysis } from '@/lib/query/hooks';
import type { Json } from '@yulia/db';
import { Card, CardContent, Skeleton } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/empty-state';

/** Best-effort string/list reader over model-authored JSON — shape varies by run. */
function pickString(value: Json, keys: string[]): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

function pickList(value: Json): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object') {
          const rec = v as Record<string, unknown>;
          const label = rec.beat ?? rec.title ?? rec.name ?? rec.label ?? rec.description ?? rec.motif;
          return typeof label === 'string' ? label : null;
        }
        return null;
      })
      .filter((v): v is string => Boolean(v));
  }
  return [];
}

export function AnalysisView({ id }: { id: string }) {
  const { data, isLoading } = useAnalysis(id);
  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  const analysis = data?.analysis;
  if (!analysis) {
    return (
      <EmptyState
        icon={Brain}
        title="The studio hasn't read the story yet"
        description="Once narration analysis completes, the emotional arc, motifs, and style guide the AI derived from your voiceover will appear here."
      />
    );
  }

  const beats = pickList(analysis.emotional_arc);
  const motifs = pickList(analysis.visual_motifs);
  const style = analysis.style_guide;
  const styleRows = [
    { label: 'Palette', value: pickString(style, ['palette', 'colorPalette', 'color_palette', 'colours']) },
    { label: 'Lighting', value: pickString(style, ['lighting', 'light']) },
    { label: 'Camera language', value: pickString(style, ['camera', 'cameraLanguage', 'camera_language']) },
    { label: 'Mood', value: pickString(style, ['mood', 'tone']) },
  ].filter((r) => r.value);

  return (
    <div className="flex flex-col gap-6">
      {analysis.summary && (
        <Card>
          <CardContent className="py-5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
              What the AI read in your story
            </p>
            <p className="mt-2 text-sm leading-relaxed text-fg">{analysis.summary}</p>
          </CardContent>
        </Card>
      )}

      {beats.length > 0 && (
        <Card>
          <CardContent className="py-5">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
              Emotional arc
            </p>
            <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
              {beats.map((beat, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="min-w-[160px] max-w-[220px] rounded-xl border border-line/8 bg-surface-2/40 p-3">
                    <span className="font-mono text-[10px] text-fg-subtle">Beat {i + 1}</span>
                    <p className="mt-1 text-xs leading-relaxed text-fg-muted">{beat}</p>
                  </div>
                  {i < beats.length - 1 && (
                    <span className="h-px w-4 shrink-0 bg-line/15" aria-hidden />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {motifs.length > 0 && (
          <Card>
            <CardContent className="py-5">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                Recurring visual motifs
              </p>
              <div className="flex flex-wrap gap-2">
                {motifs.map((m, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-accent/8 px-3 py-1 text-xs font-medium text-accent ring-1 ring-inset ring-accent/20"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {styleRows.length > 0 && (
          <Card>
            <CardContent className="py-5">
              <div className="mb-3 flex items-center gap-2">
                <Palette className="h-3.5 w-3.5 text-fg-subtle" />
                <p className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Style guide
                </p>
              </div>
              <dl className="divide-y divide-line/8 overflow-hidden rounded-xl border border-line/8">
                {styleRows.map((r) => (
                  <div key={r.label} className="flex items-start justify-between gap-4 bg-surface-1 px-3.5 py-2.5">
                    <dt className="text-xs text-fg-subtle">{r.label}</dt>
                    <dd className="max-w-[65%] text-right text-xs text-fg-muted">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        )}
      </div>

      {beats.length === 0 && motifs.length === 0 && styleRows.length === 0 && !analysis.summary && (
        <EmptyState
          icon={Brain}
          title="Analysis recorded, but empty"
          description="The story-analysis stage completed without structured detail for this run."
        />
      )}
    </div>
  );
}
