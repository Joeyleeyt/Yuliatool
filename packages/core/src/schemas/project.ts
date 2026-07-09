import { z } from 'zod';
import { RenderFormat } from '../enums/asset.js';
import { PROJECT_STATUS_VALUES } from '../enums/project-status.js';
import { PaginationSchema } from './common.js';

const renderFormatSchema = z.enum([
  RenderFormat.VERTICAL_1080x1920,
  RenderFormat.HORIZONTAL_1920x1080,
]);

export const CreateProjectSchema = z.object({
  title: z.string().trim().min(1).max(200).default('Untitled project'),
  description: z.string().trim().max(2000).optional(),
  // The picture-in-picture "window" format is a 16:9 landscape composite.
  renderFormat: renderFormatSchema.default(RenderFormat.HORIZONTAL_1920x1080),
});
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable(),
    renderFormat: renderFormatSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

export const ProjectListQuerySchema = PaginationSchema.extend({
  status: z.enum(PROJECT_STATUS_VALUES as [string, ...string[]]).optional(),
  search: z.string().trim().max(200).optional(),
});
export type ProjectListQuery = z.infer<typeof ProjectListQuerySchema>;
