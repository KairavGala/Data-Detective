/**
 * Data Detective — Native Vercel Node.js Serverless Function
 * POST /api/ai/investigate
 *
 * Module 08 AI Investigation & Intelligence endpoint supporting:
 * - `mode: "brief"` (Investigation Brief + Cross-Finding Connections + Recommendations)
 * - `mode: "question"` (Bounded Ask Your Dataset forensic Q&A)
 */

import { createInvestigateHandler } from '../_lib/investigateHandler.js';

const handler = createInvestigateHandler();

export default handler;
