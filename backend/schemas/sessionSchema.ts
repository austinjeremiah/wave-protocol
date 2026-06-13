import { z } from 'zod'

/** Body for POST /api/session/create. */
export const NewSessionSchema = z.object({
  userIntent: z
    .string()
    .min(20, 'Intent must be at least 20 characters')
    .max(500, 'Intent must be at most 500 characters'),
  budgetUsdc: z.number().min(1).max(50),
  userAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'userAddress must be a 0x address'),
})

export type NewSessionInput = z.infer<typeof NewSessionSchema>
