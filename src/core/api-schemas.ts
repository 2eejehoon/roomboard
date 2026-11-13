// HTTP request bodies (contracts/openapi.yaml components.schemas).
import { z } from 'zod';
import { roomIdSchema } from './protocol.ts';
import { THEME_IDS } from './themes.ts';

const title = z.string().trim().min(1).max(60);
const description = z.string().trim().max(300);
const password = z.string().min(4).max(64);
const themeId = z.enum(THEME_IDS);

// Error.fields values: i18n keys (src/client/i18n/ko.ts), one per field.
export const FIELD_ERRORS = { title: 'field.title', description: 'field.description', themeId: 'field.themeId', password: 'field.password' } as const;

export type FieldErrors = Partial<Record<keyof typeof FIELD_ERRORS, (typeof FIELD_ERRORS)[keyof typeof FIELD_ERRORS]>>;
// Error.fields from a failed parse, shared by the Worker's 400 and the S2 form's own check (precedent 2026-11-08-create-form-checks).
export const fieldErrors = (error: z.ZodError): FieldErrors =>
  Object.fromEntries(error.issues.flatMap(({ path: [key] }) => (typeof key === 'string' && key in FIELD_ERRORS ? [[key, FIELD_ERRORS[key as keyof typeof FIELD_ERRORS]]] : [])));

export const createRoomRequest = z.object({ title, description: description.default(''), themeId, password, turnstileToken: z.string().min(1) });

// GET /rooms. The cursor is "<createdAt>.<id>" of the last room on the previous page (ties on createdAt break by id).
export const listRoomsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().regex(/^\d+\.[A-Za-z0-9_-]{10}$/).optional(),
});

export const updateRoomRequest = z
  .object({ password, title: title.optional(), description: description.optional(), themeId: themeId.optional() })
  .refine((b) => b.title !== undefined || b.description !== undefined || b.themeId !== undefined, { message: 'nothing to update' });

export const deleteRoomRequest = z.object({ password });

export const createReportRequest = z.object({
  target: z.discriminatedUnion('type', [
    z.object({ type: z.literal('room'), roomId: roomIdSchema }),
    z.object({
      type: z.literal('message'),
      roomId: roomIdSchema,
      message: z.object({ messageId: z.string(), nickname: z.string(), text: z.string(), sentAt: z.int(), channel: z.int(), sig: z.string() }),
    }),
  ]),
  reason: z.enum(['spam', 'abuse', 'sexual', 'illegal', 'other']),
  deviceKey: z.uuid(),
});

export type CreateRoomRequest = z.infer<typeof createRoomRequest>;
export type UpdateRoomRequest = z.infer<typeof updateRoomRequest>;
export type CreateReportRequest = z.infer<typeof createReportRequest>;

// POST /bug-reports. The Worker redacts and cuts these again (research R4), so the limits here only bound the input.
const frame = z.object({ file: z.string().max(200), fn: z.string().max(100), line: z.int().min(0), col: z.int().min(0) });
export const clientErrorReport = z.object({
  errorName: z.string().max(100),
  message: z.string().max(500),
  frames: z.array(frame).max(20),
  appVersion: z.string().max(40),
  view: z.enum(['3d', '2d', 'board', 'admin']),
  browser: z.enum(['chrome', 'safari', 'firefox', 'samsung', 'edge', 'other']),
});
