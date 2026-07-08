'use client';

import { Languages, Clock } from 'lucide-react';
import { useTranscript } from '@/lib/query/hooks';
import { formatSeconds } from '@/lib/utils';
import { Card, CardContent, Skeleton } from '@/components/ui/primitives';

interface Paragraph {
  text: string;
  start: number;
  end: number;
}

export function TranscriptView({ id }: { id: string }) {
  const { data, isLoading } = useTranscript(id);
  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  const t = data?.transcript;
  if (!t) return <Empty>The transcript appears once the voiceover is analysed.</Empty>;

  const paragraphs = (t.paragraphs as unknown as Paragraph[]) ?? [];

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 py-5">
        <div className="flex flex-wrap gap-5 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <Languages className="h-3.5 w-3.5 text-fg-subtle" />
            {t.language ?? '—'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-fg-subtle" />
            {formatSeconds(t.duration_sec)}
          </span>
        </div>
        {paragraphs.length > 0 ? (
          <div className="flex flex-col gap-4">
            {paragraphs.map((p, i) => (
              <div key={i} className="flex gap-4">
                <span className="w-12 shrink-0 pt-0.5 font-mono text-xs text-fg-subtle">
                  {formatSeconds(p.start)}
                </span>
                <p className="text-sm leading-relaxed text-fg">{p.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{t.full_text}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-fg-muted">{children}</CardContent>
    </Card>
  );
}
