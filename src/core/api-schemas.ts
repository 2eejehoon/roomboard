// HTTP request bodies (contracts/openapi.yaml components.schemas).
import { z } from 'zod';
import { roomIdSchema } from './protocol.ts';
import { THEME_IDS } from './themes.ts';

const title = z.string().trim().min(1).max(60);
const description = z.string().trim().max(300);
const password = z.string().min(4).max(64);
const themeId = z.enum(THEME_IDS);

export const createRoomRequest = z.object({ title, description: description.default(''), themeId, password, turnstileToken: z.string().min(1) });

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
