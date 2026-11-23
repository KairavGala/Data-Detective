/**
 * Data Detective — Native Vercel Node.js Serverless Function
 * POST /api/ai/prototype
 *
 * Stage 1 API-first verification endpoint using the official `@google/genai` SDK.
 */

import { createPrototypeHandler } from '../_lib/prototypeHandler.js';

const handler = createPrototypeHandler();

export default handler;
