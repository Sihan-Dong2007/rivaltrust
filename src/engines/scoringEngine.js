// src/engines/scoringEngine.js
// ─────────────────────────────────────────────────────────────
// Scoring Engine — pure deterministic computation.
// No LLM calls. Reads structured tags from LLM outputs + events.
// Updates both visible dimensions and hidden modifiers.
// ─────────────────────────────────────────────────────────────

// Initial score state
export function initialScoreState() {
  return {
    // Visible dimensions (shown to user, 0–100)
    visible: {
      convictionalClarity: 0,       // Can articulate core conviction clearly
      opennessToInfluence: 0,       // Remains open without feeling betrayed
      trustUnderTension: 0,         // Risks trust under unresolved disagreement
      reciprocalReadiness: 0,       // Can anticipate rival's morally serious story
    },

    // Hidden modifiers (affect final readiness, not shown directly)
    hidden: {
      typecastingCount: 0,          // Times user reduced rival to caricature
      escalationStreak: 0,          // Consecutive turns with contemptuous tone
      abstractResponseStreak: 0,    // Consecutive turns with no concrete grounding
      goodsLanguageRatio: 0,        // Ratio of goods-language vs harm-only language
      calibrationPresent: false,    // User acknowledged uncertainty about rival motives
    },

    // Confidence: how much evidence we have for each visible score
    confidence: {
      convictionalClarity: 0,
      opennessToInfluence: 0,
      trustUnderTension: 0,
      reciprocalReadiness: 0,
    },
  };
}

/**
 * Update score state after each user turn.
 * @param {object} currentState  - Existing ScoreState
 * @param {object} event         - Event data from the current turn
 * @param {object} llmSignals    - phaseSignals JSON from LLM output (if available)
 * @returns {object}             - Updated ScoreState (immutable update)
 */
export function updateScores(currentState, event, llmSignals = {}) {
  const s = JSON.parse(JSON.stringify(currentState)); // deep clone

  // ── HIDDEN MODIFIERS ─────────────────────────────────────
  if (event.typecastingDetected) {
    s.hidden.typecastingCount += 1;
    s.hidden.escalationStreak += 1;
  } else {
    s.hidden.escalationStreak = Math.max(0, s.hidden.escalationStreak - 1);
  }

  if (event.abstractResponse) {
    s.hidden.abstractResponseStreak += 1;
  } else {
    s.hidden.abstractResponseStreak = 0;
  }

  if (event.usedGoodsLanguage) {
    // Rolling average
    s.hidden.goodsLanguageRatio = s.hidden.goodsLanguageRatio * 0.8 + 0.2;
  } else {
    s.hidden.goodsLanguageRatio = s.hidden.goodsLanguageRatio * 0.8;
  }

  if (event.calibrationPresent) {
    s.hidden.calibrationPresent = true;
  }

  // ── VISIBLE DIMENSIONS ───────────────────────────────────
  // Convictional Clarity: user stated a specific conviction
  if (llmSignals.positionStated) {
    s.visible.convictionalClarity = Math.min(100,
      s.visible.convictionalClarity + 20);
    s.confidence.convictionalClarity += 1;
  }

  // Openness to Influence: user acknowledged rival's point has merit
  if (llmSignals.rivalPointAcknowledged) {
    s.visible.opennessToInfluence = Math.min(100,
      s.visible.opennessToInfluence + 15);
    s.confidence.opennessToInfluence += 1;
  }

  // Trust Under Tension: user continued engaging after pressure
  if (event.continuedAfterPressure) {
    s.visible.trustUnderTension = Math.min(100,
      s.visible.trustUnderTension + 10);
    s.confidence.trustUnderTension += 1;
  }

  // Reciprocal Readiness: user accurately described rival's good
  if (llmSignals.rivalGoodNamed && !event.typecastingDetected) {
    s.visible.reciprocalReadiness = Math.min(100,
      s.visible.reciprocalReadiness + 15);
    s.confidence.reciprocalReadiness += 1;
  }

  // ── HIDDEN MODIFIER DAMPENING ────────────────────────────
  // Typecasting reduces visible scores
  if (s.hidden.typecastingCount > 2) {
    s.visible.reciprocalReadiness = Math.max(0,
      s.visible.reciprocalReadiness - 10);
  }

  // Escalation streak reduces trust score
  if (s.hidden.escalationStreak >= 3) {
    s.visible.trustUnderTension = Math.max(0,
      s.visible.trustUnderTension - 15);
  }

  return s;
}

/**
 * Compute a final readiness summary from the score state.
 * Called at the end to generate the Narrative Mirror context.
 */
export function computeReadinessSummary(scoreState) {
  const v = scoreState.visible;
  const h = scoreState.hidden;

  const rawScore = (
    v.convictionalClarity * 0.25 +
    v.opennessToInfluence * 0.25 +
    v.trustUnderTension * 0.30 +
    v.reciprocalReadiness * 0.20
  );

  // Apply hidden modifiers
  const typecastingPenalty = Math.min(20, h.typecastingCount * 5);
  const escalationPenalty = Math.min(15, h.escalationStreak * 5);
  const goodsBonus = h.goodsLanguageRatio * 10;
  const calibrationBonus = h.calibrationPresent ? 5 : 0;

  const finalScore = Math.max(0, Math.min(100,
    rawScore - typecastingPenalty - escalationPenalty + goodsBonus + calibrationBonus
  ));

  return {
    finalScore: Math.round(finalScore),
    visible: v,
    hidden: h,
    penalties: { typecastingPenalty, escalationPenalty },
    bonuses: { goodsBonus, calibrationBonus },
  };
}
