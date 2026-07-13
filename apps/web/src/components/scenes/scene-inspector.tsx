'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Film,
  ImageIcon,
  Copy,
  Clapperboard,
  type LucideIcon,
} from 'lucide-react';
import type { SceneView } from '@/lib/api/types';
import type { Json } from '@yulia/db';
import { Badge, Button } from '@/components/ui/primitives';
import { sceneStatusMeta } from './scene-status';
import { useToast } from '@/components/ui/toast';
import { easePremium } from '@/components/ui/motion';
import { formatSeconds } from '@/lib/utils';
import { cn } from '@/lib/utils';

type Tab = 'script' | 'prompt' | 'metadata';
const TABS: { id: Tab; label: string }[] = [
  { id: 'script', label: 'Script' },
  { id: 'prompt', label: 'Prompt' },
  { id: 'metadata', label: 'Metadata' },
];

export function SceneInspector({ scene, onClose }: { scene: SceneView | null; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('script');

  useEffect(() => {
    if (!scene) return;
    setTab('script');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [scene, onClose]);

  return (
    <AnimatePresence>
      {scene && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            key={scene.id}
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line/10 bg-bg shadow-lg sm:max-w-[480px]"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
          >
            <Header scene={scene} onClose={onClose} />

            <div className="flex-1 overflow-y-auto">
              <Media scene={scene} />

              {/* Tabs */}
              <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-line/8 bg-bg/90 px-5 backdrop-blur">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      'relative px-3 py-3 text-sm font-medium transition-colors',
                      tab === t.id ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted',
                    )}
                  >
                    {t.label}
                    {tab === t.id && (
                      <motion.span
                        layoutId="inspector-tab"
                        className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent"
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}
                  </button>
                ))}
              </div>

              <div className="p-5">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2, ease: easePremium }}
                  >
                    {tab === 'script' && <ScriptTab scene={scene} />}
                    {tab === 'prompt' && <PromptTab scene={scene} />}
                    {tab === 'metadata' && <MetadataTab scene={scene} />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Header({ scene, onClose }: { scene: SceneView; onClose: () => void }) {
  const isVideo = scene.visual_type === 'video';
  const meta = sceneStatusMeta(scene.assetStatus);
  const seconds = Math.max(0, Math.round(scene.end_sec - scene.start_sec));
  const StatusIcon = meta.icon;

  return (
    <div className="flex items-start gap-3 border-b border-line/8 p-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-fg-subtle">Scene #{scene.scene_index + 1}</span>
          <Badge tone={isVideo ? 'violet' : 'amber'}>
            {isVideo ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
            {isVideo ? 'Clip' : 'Still'}
          </Badge>
          <span className="font-mono text-xs text-fg-subtle">{seconds}s</span>
        </div>
        <h2 className="mt-1.5 truncate text-lg font-semibold tracking-tight text-fg">
          {scene.title ?? `Scene ${scene.scene_index + 1}`}
        </h2>
        <span
          className={cn(
            'mt-1 inline-flex items-center gap-1.5 text-xs font-medium',
            meta.tone === 'emerald' && 'text-success',
            meta.tone === 'violet' && 'text-accent',
            meta.tone === 'red' && 'text-danger',
            meta.tone === 'neutral' && 'text-fg-subtle',
          )}
        >
          <StatusIcon className={cn('h-3.5 w-3.5', meta.kind === 'active' && 'animate-spin')} />
          {meta.label}
        </span>
      </div>
      <button
        onClick={onClose}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function Media({ scene }: { scene: SceneView }) {
  if (!scene.assetUrl) {
    return (
      <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-surface-2 to-surface-3">
        <div className="pointer-events-none absolute inset-0 bg-grain" />
        <div className="relative flex flex-col items-center gap-2 text-fg-subtle">
          <Clapperboard className="h-7 w-7" />
          <span className="text-xs capitalize">{scene.assetStatus ?? 'pending'}</span>
        </div>
      </div>
    );
  }
  return scene.visual_type === 'video' ? (
    <video src={scene.assetUrl} controls className="aspect-video w-full bg-black" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={scene.assetUrl} alt={scene.title ?? 'scene'} className="aspect-video w-full object-cover" />
  );
}

function ScriptTab({ scene }: { scene: SceneView }) {
  return (
    <div className="flex flex-col gap-5">
      <Field label="Narration">
        {scene.narration_text ? (
          <p className="border-l-2 border-accent/25 pl-3 text-sm italic leading-relaxed text-fg-muted">
            &ldquo;{scene.narration_text}&rdquo;
          </p>
        ) : (
          <Empty>No narration mapped to this scene.</Empty>
        )}
      </Field>
      {scene.summary && (
        <Field label="Summary">
          <p className="text-sm leading-relaxed text-fg-muted">{scene.summary}</p>
        </Field>
      )}
      <Field label="Narration timing">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Start" value={formatSeconds(scene.start_sec)} />
          <Stat label="End" value={formatSeconds(scene.end_sec)} />
          <Stat label="Duration" value={`${Math.max(0, Math.round(scene.end_sec - scene.start_sec))}s`} />
        </div>
      </Field>
    </div>
  );
}

function PromptTab({ scene }: { scene: SceneView }) {
  const toast = useToast();
  const positive = scene.prompt?.positive_prompt;
  const negative = scene.prompt?.negative_prompt;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Prompt copied', 'The generation prompt is on your clipboard.');
    } catch {
      toast.error('Copy failed', 'Your browser blocked clipboard access.');
    }
  };

  if (!positive) return <Empty>No prompt has been generated for this scene yet.</Empty>;

  return (
    <div className="flex flex-col gap-5">
      <Field label="Generation prompt">
        <div className="rounded-xl border border-line/8 bg-surface-2/60 p-3.5">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-fg-muted">{positive}</p>
        </div>
      </Field>
      {negative && (
        <Field label="Negative prompt">
          <div className="rounded-xl border border-line/8 bg-surface-2/60 p-3.5">
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-fg-subtle">{negative}</p>
          </div>
        </Field>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void copy(positive)}>
          <Copy className="h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
    </div>
  );
}

/** Best-effort reads of the scene's visual brief (shape is model-authored JSON). */
function pickString(brief: Json, keys: string[]): string | null {
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) return null;
  const rec = brief as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === 'string' && v.trim()) return v;
    if (Array.isArray(v) && v.length) return v.filter((x) => typeof x === 'string').join(', ');
  }
  return null;
}

function MetadataTab({ scene }: { scene: SceneView }) {
  const brief = scene.visual_brief;
  const rows: { label: string; value: string | null; icon?: LucideIcon }[] = [
    { label: 'Shot type', value: pickString(brief, ['shotType', 'shot_type', 'shot', 'composition']) },
    { label: 'Camera movement', value: pickString(brief, ['cameraMovement', 'camera_movement', 'camera', 'motion']) },
    { label: 'Lighting', value: pickString(brief, ['lighting', 'light']) },
    { label: 'Mood', value: pickString(brief, ['mood', 'tone', 'emotion']) },
    { label: 'Colour palette', value: pickString(brief, ['colorPalette', 'color_palette', 'palette', 'colours']) },
  ];
  const known = rows.filter((r) => r.value);

  return (
    <div className="flex flex-col gap-5">
      <Field label="Creative direction">
        {known.length ? (
          <dl className="divide-y divide-line/8 overflow-hidden rounded-xl border border-line/8">
            {known.map((r) => (
              <div key={r.label} className="flex items-start justify-between gap-4 bg-surface-1 px-3.5 py-2.5">
                <dt className="text-xs text-fg-subtle">{r.label}</dt>
                <dd className="max-w-[60%] text-right text-xs text-fg-muted">{r.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <Empty>No creative-direction metadata recorded for this scene.</Empty>
        )}
      </Field>

      <Field label="Generation">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Created" value={new Date(scene.created_at).toLocaleString()} />
          <Stat label="Updated" value={new Date(scene.updated_at).toLocaleString()} />
        </div>
      </Field>
    </div>
  );
}

// --- small building blocks --------------------------------------------------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">{label}</p>
      {children}
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/8 bg-surface-2/60 p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className="mt-0.5 font-mono text-xs text-fg">{value}</p>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-fg-subtle">{children}</p>;
}
