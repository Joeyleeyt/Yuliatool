'use client';

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
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  const t = data?.transcript;
  if (!t) return <Empty>No transcript yet.</Empty>;

  const paragraphs = (t.paragraphs as unknown as Paragraph[]) ?? [];

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-5">
        <div className="flex gap-4 text-xs text-neutral-500">
          <span>Language: {t.language ?? '—'}</span>
          <span>Duration: {formatSeconds(t.duration_sec)}</span>
        </div>
        {paragraphs.length > 0 ? (
          <div className="flex flex-col gap-3">
            {paragraphs.map((p, i) => (
              <div key={i} className="flex gap-3">
                <span className="w-12 shrink-0 pt-0.5 text-xs text-neutral-400">{formatSeconds(p.start)}</span>
                <p className="text-sm leading-relaxed">{p.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{t.full_text}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-neutral-500">{children}</CardContent>
    </Card>
  );
}
