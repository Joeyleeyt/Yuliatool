'use client';

import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AudioLines, UploadCloud, Sparkles, X } from 'lucide-react';
import { useUploadVoiceover } from '@/lib/query/hooks';
import { Button, Spinner } from '@/components/ui/primitives';
import { formatBytes } from '@/lib/utils';
import { cn } from '@/lib/utils';

const ACCEPT = ['mp3', 'wav', 'm4a', 'aac', 'webm', 'ogg'];

export function UploadZone({ projectId }: { projectId: string }) {
  const upload = useUploadVoiceover(projectId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const onFiles = useCallback((files: FileList | null) => {
    const f = files?.[0];
    if (f) setFile(f);
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        }}
        onClick={() => !file && inputRef.current?.click()}
        className={cn(
          'relative cursor-pointer overflow-hidden rounded-3xl border border-dashed p-10 text-center transition-all duration-300',
          dragging
            ? 'border-accent/60 bg-accent/8 scale-[1.01]'
            : 'border-line/14 bg-surface-1/60 hover:border-line/24',
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-accent-radial opacity-50" />
        {dragging && <div className="pointer-events-none absolute inset-0 bg-grain" />}

        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />

        {!file ? (
          <div className="relative flex flex-col items-center">
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
              className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-accent-soft to-accent shadow-glow"
            >
              <UploadCloud className="h-7 w-7 text-white" />
            </motion.div>
            <p className="text-lg font-medium tracking-tight text-fg">Drop your voiceover to begin</p>
            <p className="mt-1.5 text-sm text-fg-muted">
              or <span className="text-accent-soft">browse files</span> — the studio does the rest
            </p>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-wide text-fg-subtle">
              {ACCEPT.join(' · ')}
            </p>
          </div>
        ) : (
          <div className="relative flex flex-col items-center">
            <div className="mb-5 flex w-full max-w-md items-center gap-3 rounded-xl border border-line/10 bg-surface-2/70 p-3.5 text-left">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-3 text-accent-soft">
                <AudioLines className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{file.name}</p>
                <p className="text-xs text-fg-subtle">{formatBytes(file.size)}</p>
              </div>
              {!upload.isPending && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                  className="grid h-7 w-7 place-items-center rounded-md text-fg-subtle hover:bg-surface-3 hover:text-fg"
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <Button
              variant="accent"
              size="lg"
              className="min-w-56"
              disabled={upload.isPending}
              onClick={(e) => {
                e.stopPropagation();
                upload.mutate(file);
              }}
            >
              {upload.isPending ? (
                <>
                  <Spinner /> Starting the studio…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Launch production
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {upload.isError && (
        <p className="mt-3 text-center text-sm text-danger">{(upload.error as Error).message}</p>
      )}
    </div>
  );
}
