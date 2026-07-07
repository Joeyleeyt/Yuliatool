export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">yulia-video</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        Voiceover → cinematic YouTube video. The dashboard ships in Phase 7; the REST API and
        pipeline are being built phase by phase.
      </p>
      <p className="text-sm text-neutral-500">
        API health:{' '}
        <a className="underline" href="/api/health">
          /api/health
        </a>
      </p>
    </main>
  );
}
