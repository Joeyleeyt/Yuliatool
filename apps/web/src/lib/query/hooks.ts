'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateProjectInput, UpdateProjectInput } from '@yulia/core';
import { api } from '@/lib/api/client';
import type {
  Paginated,
  ProjectRow,
  ProjectListRow,
  SceneView,
  AssetView,
  RenderView,
  StatusView,
  TranscriptRow,
  ActivityLogRow,
  OwnerActivityRow,
  AnalysisRow,
  UploadTicket,
} from '@/lib/api/types';

const TERMINAL = new Set(['completed', 'failed']);

export function useProjects(params: { status?: string; search?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);
  return useQuery({
    queryKey: ['projects', params],
    queryFn: () => api<Paginated<ProjectListRow>>(`/api/projects?${qs.toString()}`),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => api<{ project: ProjectRow }>(`/api/projects/${id}`),
    // Poll until the project reaches a terminal state so the header status and
    // the completed-video gate update live (no manual refresh needed).
    refetchInterval: (query) =>
      query.state.data && TERMINAL.has(query.state.data.project.status) ? false : 4000,
  });
}

export function useProjectStatus(id: string) {
  return useQuery({
    queryKey: ['status', id],
    queryFn: () => api<StatusView>(`/api/projects/${id}/status`),
    refetchInterval: (query) => (query.state.data && TERMINAL.has(query.state.data.status) ? false : 3000),
  });
}

export function useScenes(id: string) {
  return useQuery({
    queryKey: ['scenes', id],
    queryFn: () => api<{ scenes: SceneView[] }>(`/api/projects/${id}/scenes`),
  });
}

export function useTranscript(id: string) {
  return useQuery({
    queryKey: ['transcript', id],
    queryFn: () => api<{ transcript: TranscriptRow | null }>(`/api/projects/${id}/transcript`),
  });
}

export function useAssets(id: string) {
  return useQuery({
    queryKey: ['assets', id],
    queryFn: () => api<{ assets: AssetView[] }>(`/api/projects/${id}/assets`),
  });
}

export function useRender(id: string) {
  return useQuery({
    queryKey: ['render', id],
    queryFn: () => api<RenderView>(`/api/projects/${id}/render`),
    // Keep polling until the final MP4 is ready + has a playable URL, so the
    // player appears the moment rendering finishes.
    refetchInterval: (query) =>
      query.state.data?.render?.status === 'completed' && query.state.data.url ? false : 5000,
  });
}

export function useActivity(id: string) {
  return useQuery({
    queryKey: ['activity', id],
    queryFn: () => api<{ activity: ActivityLogRow[] }>(`/api/projects/${id}/activity`),
  });
}

/** Cross-project feed for the Studio dashboard's "Recent Activity" section. */
export function useWorkspaceActivity() {
  return useQuery({
    queryKey: ['workspace-activity'],
    queryFn: () => api<{ activity: OwnerActivityRow[] }>('/api/activity'),
  });
}

export function useAnalysis(id: string) {
  return useQuery({
    queryKey: ['analysis', id],
    queryFn: () => api<{ analysis: AnalysisRow | null }>(`/api/projects/${id}/analysis`),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      api<{ project: ProjectRow }>('/api/projects', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectInput) =>
      api<{ project: ProjectRow }>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['project', id] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useRetryProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ project: ProjectRow }>(`/api/projects/${id}/retry`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['project', id] });
      void qc.invalidateQueries({ queryKey: ['status', id] });
    },
  });
}

export interface CostView {
  totalUsd: number;
  totalOperations: number;
  byProvider: { provider: string; operations: number; costUsd: number }[];
}

export function useCost(id: string) {
  return useQuery({ queryKey: ['cost', id], queryFn: () => api<CostView>(`/api/projects/${id}/cost`) });
}

/** Three-step voiceover upload: presign -> PUT to R2 -> complete. */
export function useUploadVoiceover(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const contentType = file.type || guessContentType(file.name);
      const ticket = await api<UploadTicket>(`/api/projects/${projectId}/upload`, {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, contentType, sizeBytes: file.size }),
      });

      const put = await fetch(ticket.upload.url, {
        method: 'PUT',
        headers: ticket.upload.headers,
        body: file,
      });
      if (!put.ok) throw new Error(`Upload to storage failed (${put.status})`);

      return api<{ project: ProjectRow }>(`/api/projects/${projectId}/upload/complete`, {
        method: 'POST',
        body: JSON.stringify({ assetId: ticket.assetId }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['project', projectId] });
      void qc.invalidateQueries({ queryKey: ['status', projectId] });
    },
  });
}

function guessContentType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    webm: 'audio/webm',
    ogg: 'audio/ogg',
  };
  return (ext && map[ext]) || 'audio/mpeg';
}
