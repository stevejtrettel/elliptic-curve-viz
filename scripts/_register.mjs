// Registers the @/ → src/ alias resolver so `node scripts/*.ts` works
// (Node ≥ 23.6 strips TypeScript types natively; it just can't see tsconfig paths).
import { register } from 'node:module'

register(new URL('./ts-alias-hooks.mjs', import.meta.url))
