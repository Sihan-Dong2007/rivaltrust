// src/engines/promptEngine.js
// ─────────────────────────────────────────────────────────────
// Prompt Engine
// Assembles the final system prompt for each LLM call
// by combining: base + role + phase + persona + context.
// No LLM calls happen here — pure assembly logic.
// ─────────────────────────────────────────────────────────────

import {
  FACILITATOR_BASE,
  PHASE_PROMPTS,
  RIVAL_BASE,
  NARRATOR_PROMPT,
  RIVAL_ASSESSMENT_PROMPT,
  FACILITATOR_ASSESSMENT_PROMPT,
} from "../prompts/systemPrompts";

import { buildPersonaPrompt } from "../personas/rivalPersonas";

/**
 * Assemble the system prompt for the Facilitator (Phases 1 & 2).
 */
export function assembleFacilitatorPrompt(phase, profile) {
  const phaseInstruction = PHASE_PROMPTS[phase] || "";
  const contextNote = profile.topic
    ? `\nUser's chosen topic: ${profile.topic}. User's name: ${profile.name}.`
    : "";
  return `${FACILITATOR_BASE}\n\n${phaseInstruction}${contextNote}`;
}

/**
 * Assemble the system prompt for the Rival (Phase 4).
 * Injects persona config and optional strategy note from Router.
 */
export function assembleRivalPrompt(personaId, strategyNote = "") {
  const personaSection = buildPersonaPrompt(personaId);
  const strategySection = strategyNote
    ? `\n[Internal strategy note from negotiation: ${strategyNote}]`
    : "";
  return `${RIVAL_BASE}\n${personaSection}${strategySection}`;
}

/**
 * Assemble the Facilitator intervention prompt.
 * Called only when Router decides Facilitator should speak.
 */
export function assembleFacilitatorInterventionPrompt(triggerType, profile) {
  const triggerInstructions = {
    typecasting:
      "The user has reduced the rival to a caricature or monster. Gently but directly redirect: ask what serious good the rival might believe they are defending.",
    escalation:
      "The user's tone has become contemptuous or absolutist. Slow the tempo. Redirect attention to what is being protected, not only what is feared.",
    avoidance:
      "The user is staying abstract and not engaging the rival's actual argument. Ask for one specific memory or concrete example.",
    overconfidence:
      "The user is asserting the rival's motives as fact without calibration. Introduce uncertainty: ask how confident they are this is the rival's real motive.",
    collapse:
      "The user has said trust is impossible under any uncertainty. Distinguish trust from naivete: ask what a disciplined, limited trust-risk might look like here.",
  };

  const instruction =
    triggerInstructions[triggerType] ||
    "Provide a brief, grounding facilitation move appropriate to the current moment.";

  return `${FACILITATOR_BASE}

You are intervening right now. Trigger: ${triggerType}.
${instruction}
Keep your response to 1-2 sentences. Be direct. Do not summarize the conversation.
User's topic: ${profile.topic}.`;
}

/**
 * Assemble the Narrator prompt for Narrative Mirror Summary.
 * Injects scoring context if available.
 */
export function assembleNarratorPrompt(scoreState) {
  const scoreContext = scoreState
    ? `\nCurrent readiness scores for context (do not quote these directly, use them to inform your analysis):
${JSON.stringify(scoreState, null, 2)}`
    : "";
  return `${NARRATOR_PROMPT}${scoreContext}`;
}

/**
 * Return the Rival internal assessment prompt (no assembly needed).
 */
export function assembleRivalAssessmentPrompt() {
  return RIVAL_ASSESSMENT_PROMPT;
}

/**
 * Return the Facilitator internal assessment prompt (no assembly needed).
 */
export function assembleFacilitatorAssessmentPrompt() {
  return FACILITATOR_ASSESSMENT_PROMPT;
}
