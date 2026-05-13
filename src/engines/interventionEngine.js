// src/engines/interventionEngine.js
// ─────────────────────────────────────────────────────────────
// Intervention Engine
// Two-part system:
//   1. Rule-based detector (pure code) — reads LLM assessment signals
//   2. Facilitator LLM caller — only invoked when detector fires
// ─────────────────────────────────────────────────────────────

import { callOllama, parseJSON, MODELS } from "../api/ollama";
import {
  assembleRivalAssessmentPrompt,
  assembleFacilitatorAssessmentPrompt,
  assembleFacilitatorInterventionPrompt,
} from "./promptEngine";

// ── PART 1: ROUTER ───────────────────────────────────────────
// Runs two LLM assessments in parallel, then decides who speaks.

/**
 * Run parallel assessments and return negotiation result.
 * This is the "method 3" multi-agent negotiation.
 *
 * @param {Array}  apiMessages  - Conversation history in {role, content} format
 * @param {object} profile      - User profile
 * @returns {object}            - { rivalAssessment, facilitatorAssessment, decision }
 */
export async function negotiate(apiMessages, profile) {
  const rivalAssessmentFallback = {
    emotional_state: "engaged",
    strategy: "continue making the case",
    yield_point: false,
    escalation_needed: false,
  };

  const facilitatorAssessmentFallback = {
    intervene: false,
    urgency: "low",
    trigger: "none",
    intervention_note: "",
  };

  // Parallel: both assessment LLMs run at the same time
  const [rivalRaw, facilitatorRaw] = await Promise.all([
    callOllama(
      MODELS.router,
      assembleRivalAssessmentPrompt(),
      apiMessages
    ),
    callOllama(
      MODELS.router,
      assembleFacilitatorAssessmentPrompt(),
      apiMessages
    ),
  ]);

  const rivalAssessment = parseJSON(rivalRaw, rivalAssessmentFallback);
  const facilitatorAssessment = parseJSON(facilitatorRaw, facilitatorAssessmentFallback);

  // ROUTER DECISION LOGIC
  // Facilitator high or medium urgency always overrides Rival
  let decision;
  if (facilitatorAssessment.intervene && facilitatorAssessment.urgency === "high") {
    decision = {
      speaker: "facilitator",
      reason: facilitatorAssessment.trigger,
      note: facilitatorAssessment.intervention_note,
    };
  } else if (facilitatorAssessment.intervene && facilitatorAssessment.urgency === "medium") {
    decision = {
      speaker: "facilitator",
      reason: facilitatorAssessment.trigger,
      note: facilitatorAssessment.intervention_note,
    };
  } else {
    decision = {
      speaker: "rival",
      strategy: rivalAssessment.strategy,
    };
  }

  return { rivalAssessment, facilitatorAssessment, decision };
}

// ── PART 2: FACILITATOR CALLER ───────────────────────────────
// Only called when Router decides Facilitator should speak.

/**
 * Generate a facilitator intervention response.
 *
 * @param {Array}  apiMessages  - Conversation history
 * @param {string} triggerType  - Why we're intervening
 * @param {object} profile      - User profile
 * @returns {string}            - Facilitator's spoken response
 */
export async function generateIntervention(apiMessages, triggerType, profile) {
  const systemPrompt = assembleFacilitatorInterventionPrompt(triggerType, profile);
  return await callOllama(MODELS.facilitator, systemPrompt, apiMessages);
}
