// src/engines/phaseEngine.js
// ─────────────────────────────────────────────────────────────
// Phase Engine — pure deterministic state machine.
// No LLM calls. Reads hard conditions + LLM signals + scores.
// ─────────────────────────────────────────────────────────────

export const PHASE_ORDER = [0, 1, 2, 4];

export const PHASE_META = {
  0: {
    id: 0,
    name: "Onboarding",
    label: "Welcome",
    description: "Set up your profile",
  },
  1: {
    id: 1,
    name: "Motives & Beliefs",
    label: "Phase 1",
    description: "Clarify what you stand for",
  },
  2: {
    id: 2,
    name: "Formation Story",
    label: "Phase 2",
    description: "Where your convictions come from",
  },
  4: {
    id: 4,
    name: "Practice Engagement",
    label: "Phase 4",
    description: "Engage the rival",
  },
};

// Questions per phase — Facilitator works through these in order
export const PHASE_QUESTIONS = {
  1: [
    "What is one thing you believe strongly about this topic — not a policy detail, but a moral conviction?",
    "What good are you trying to protect with that belief?",
    "What do you fear would be lost or damaged if your view lost out?",
  ],
  2: [
    "Tell me about a specific moment or experience that shaped how you think about this issue.",
    "Who in your life influenced how you see this — and what did they show you?",
    "Has your view ever shifted on this? What moved it, even slightly?",
  ],
};

/**
 * Completion gates for each phase.
 * Returns true if the phase can be advanced.
 *
 * @param {number} phase         - Current phase id
 * @param {object} hardState     - Countable session state
 * @param {object} llmSignals    - Signals from LLM JSON outputs
 * @param {object} scoreState    - Current scoring engine output
 */
export function canAdvancePhase(phase, hardState, llmSignals = {}, scoreState = {}) {
  switch (phase) {
    case 0:
      // Onboarding: name and topic must be set
      return !!(hardState.profile?.name && hardState.profile?.topic);

    case 1:
      // Phase 1: all three questions answered
      return hardState.questionIndex >= PHASE_QUESTIONS[1].length - 1
        && hardState.turnCount >= 3;

    case 2:
      // Phase 2: all three questions answered
      return hardState.questionIndex >= PHASE_QUESTIONS[2].length - 1
        && hardState.turnCount >= 3;

    case 4:
      // Phase 4: minimum engagement before ending
      return hardState.rivalTurnCount >= 4;

    default:
      return false;
  }
}

/**
 * Get the next phase id after the current one.
 * Returns null if already at the last phase.
 */
export function getNextPhase(currentPhase) {
  const idx = PHASE_ORDER.indexOf(currentPhase);
  if (idx === -1 || idx >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

/**
 * Get the opening message when entering a new phase.
 */
export function getPhaseEntryMessage(phase, profile, personaName) {
  switch (phase) {
    case 1:
      return `Good to meet you, ${profile.name}. We'll be working through your convictions on ${profile.topic}.\n\n${PHASE_QUESTIONS[1][0]}`;
    case 2:
      return `Now let's go deeper — into where your convictions actually come from.\n\n${PHASE_QUESTIONS[2][0]}`;
    case 4:
      return `You're ready to engage.\n\nMeet ${personaName} — your rival in this conversation. They hold a different vision of the good on ${profile.topic}. Speak your mind. They will respond.\n\nWhat do you believe about ${profile.topic}?`;
    default:
      return "";
  }
}
