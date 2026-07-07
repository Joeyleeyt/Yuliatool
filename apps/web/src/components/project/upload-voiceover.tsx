'use client';

import { useRef, useState } from 'react';
import { useUploadVoiceover } from '@/lib/query/hooks';
import { Button, Card, CardContent, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';

export function UploadVoiceover({ id }: { id: string }) {
  const upload = useUploadVoiceover(id);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload voiceover</CardTitle>
        <p className="text-sm text-neutral-500">
          MP3, WAV, M4A, AAC, WEBM or OGG. Generation starts automatically once uploaded.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="text-sm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {upload.isError && <p className="text-sm text-red-600">{(upload.error as Error).message}</p>}
        <div>
          <Button disabled={!file || upload.isPending} onClick={() => file && upload.mutate(file)}>
            {upload.isPending ? <Spinner /> : 'Upload & start'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
