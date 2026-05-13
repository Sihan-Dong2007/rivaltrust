// src/App.jsx
// ─────────────────────────────────────────────────────────────
// Main orchestrator component.
// Connects all engines: Phase, Prompt, Intervention, Scoring.
// Two LLMs: LLM1 (Rival/Narrator) and LLM2 (Facilitator).
// ─────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import { callOllama, MODELS } from "./api/ollama";
import {
  PHASE_ORDER, PHASE_META, PHASE_QUESTIONS,
  getNextPhase, getPhaseEntryMessage, canAdvancePhase,
} from "./engines/phaseEngine";
import {
  assembleFacilitatorPrompt,
  assembleRivalPrompt,
  assembleNarratorPrompt,
} from "./engines/promptEngine";
import { negotiate, generateIntervention } from "./engines/interventionEngine";
import { initialScoreState, updateScores, computeReadinessSummary } from "./engines/scoringEngine";
import { RIVAL_PERSONAS } from "./personas/rivalPersonas";

const ACTIVE_PERSONA_ID = "POL_NAT_01";
const persona = RIVAL_PERSONAS[ACTIVE_PERSONA_ID];

// ── HELPERS ──────────────────────────────────────────────────

function toApiMessages(messages) {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));
}

function detectSimpleSignals(text) {
  const lower = text.toLowerCase();
  return {
    typecastingDetected: /monster|idiot|racist|stupid|evil|fool|bigot/i.test(text),
    abstractResponse: text.split(" ").length < 15,
    usedGoodsLanguage: /protect|preserve|value|care about|believe in|stand for/i.test(text),
    calibrationPresent: /maybe|perhaps|i think|not sure|could be|might/i.test(text),
    continuedAfterPressure: true, // if they're sending a message, they continued
  };
}

// ── COMPONENT ────────────────────────────────────────────────

export default function App() {
  const [phase, setPhase] = useState(0);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [negotiation, setNegotiation] = useState(null);
  const [showPanel, setShowPanel] = useState(true);
  const [profile, setProfile] = useState({ name: "", topic: "" });
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [phaseComplete, setPhaseComplete] = useState(false);
  const [scoreState, setScoreState] = useState(initialScoreState());
  const [rivalTurnCount, setRivalTurnCount] = useState(0);
  const [narrativeSummary, setNarrativeSummary] = useState(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── ONBOARDING ─────────────────────────────────────────────
  function handleOnboarding(value) {
    if (!value.trim()) return;
    if (onboardingStep === 0) {
      setProfile((p) => ({ ...p, name: value.trim() }));
      setOnboardingStep(1);
      setMessages([{
        role: "system-info",
        content: `Welcome, ${value.trim()}. What topic do you want to explore? (e.g. immigration, climate policy, abortion, economic inequality)`,
      }]);
    } else {
      const newProfile = { name: profile.name, topic: value.trim() };
      setProfile(newProfile);
      advanceToPhase(1, newProfile);
    }
  }

  // ── PHASE TRANSITION ────────────────────────────────────────
  function advanceToPhase(nextPhase, currentProfile = profile) {
    setPhase(nextPhase);
    setPhaseComplete(false);
    setQuestionIndex(0);
    setNegotiation(null);

    const entryMsg = getPhaseEntryMessage(nextPhase, currentProfile, persona.name);
    if (entryMsg) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: entryMsg,
        speaker: nextPhase === 4 ? persona.name : "Facilitator",
      }]);
    }
  }

  function handleAdvancePhase() {
    const next = getNextPhase(phase);
    if (next !== null) advanceToPhase(next);
  }

  // ── NARRATIVE MIRROR SUMMARY ────────────────────────────────
  async function generateNarrativeSummary() {
    setGeneratingSummary(true);
    const summary = computeReadinessSummary(scoreState);
    const systemPrompt = assembleNarratorPrompt(summary);
    const apiMessages = toApiMessages(messages);

    try {
      const result = await callOllama(MODELS.rival, systemPrompt, [
        ...apiMessages,
        { role: "user", content: "Please generate my Narrative Mirror Summary based on everything I've shared." },
      ]);
      setNarrativeSummary(result);
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: result,
        speaker: "Narrator",
        isNarrative: true,
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "Error generating summary: " + err.message,
        speaker: "System",
      }]);
    }
    setGeneratingSummary(false);
  }

  // ── MAIN SEND HANDLER ───────────────────────────────────────
  async function handleSend() {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    setInput("");

    // Phase 0: onboarding
    if (phase === 0) {
      handleOnboarding(userText);
      return;
    }

    const newMessages = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setLoading(true);

    // Update scoring with simple signal detection
    const signals = detectSimpleSignals(userText);
    const newScoreState = updateScores(scoreState, signals);
    setScoreState(newScoreState);

    try {
      // ── PHASES 1 & 2: Facilitator-guided questions ──────────
      if (phase === 1 || phase === 2) {
        const questions = PHASE_QUESTIONS[phase];
        const nextIdx = questionIndex + 1;
        const isLast = nextIdx >= questions.length;

        if (isLast) {
          setMessages([...newMessages, {
            role: "assistant",
            content: "Thank you — that's useful to know.",
            speaker: "Facilitator",
          }]);
          setPhaseComplete(true);
        } else {
          // Ask next structured question via Facilitator LLM
          const systemPrompt = assembleFacilitatorPrompt(phase, profile);
          const apiMessages = toApiMessages([...newMessages]);
          const nextQuestion = await callOllama(
            MODELS.facilitator,
            systemPrompt,
            [...apiMessages, { role: "user", content: `Ask this exact question: "${questions[nextIdx]}"` }]
          );
          setMessages([...newMessages, {
            role: "assistant",
            content: questions[nextIdx], // Use structured question directly for reliability
            speaker: "Facilitator",
          }]);
          setQuestionIndex(nextIdx);
        }
        setLoading(false);
        return;
      }

      // ── PHASE 4: Multi-agent negotiation ───────────────────
      if (phase === 4) {
        const apiMessages = toApiMessages(newMessages);

        // Run negotiation (parallel rival + facilitator assessment)
        const neg = await negotiate(apiMessages, profile);
        setNegotiation(neg);

        let responseText, speaker;

        if (neg.decision.speaker === "facilitator") {
          // Facilitator wins: generate intervention
          responseText = await generateIntervention(
            apiMessages,
            neg.decision.reason,
            profile
          );
          speaker = "Facilitator ⚡";
        } else {
          // Rival speaks: inject strategy note into prompt
          const rivalPrompt = assembleRivalPrompt(
            ACTIVE_PERSONA_ID,
            neg.decision.strategy
          );
          responseText = await callOllama(MODELS.rival, rivalPrompt, apiMessages);
          speaker = persona.name;
          setRivalTurnCount((c) => c + 1);

          // Check phase advancement
          const newRivalCount = rivalTurnCount + 1;
          if (newRivalCount >= 4) setPhaseComplete(true);
        }

        setMessages([...newMessages, {
          role: "assistant",
          content: responseText,
          speaker,
        }]);
      }
    } catch (err) {
      setMessages([...newMessages, {
        role: "assistant",
        content: `Error: ${err.message}. Is Ollama running? Try: ollama serve`,
        speaker: "System",
      }]);
    }

    setLoading(false);
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const phaseInfo = PHASE_META[phase];
  const scores = scoreState.visible;

  // ── RENDER ────────────────────────────────────────────────
  return (
    <div style={{
      fontFamily: "'Georgia', serif",
      background: "#0f0f0f",
      color: "#e8e4dc",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* HEADER */}
      <div style={{
        borderBottom: "1px solid #1e1e1e",
        padding: "14px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#111",
      }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "#555", textTransform: "uppercase" }}>
            Rivaltrust
          </div>
          <div style={{ fontSize: 17, fontWeight: "bold" }}>Builder</div>
        </div>

        {/* Phase stepper */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {PHASE_ORDER.map((p, i) => (
            <div key={p} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                border: `1px solid ${p === phase ? "#c9a84c" : p < phase ? "#333" : "#222"}`,
                background: p === phase ? "#1a1505" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10,
                color: p === phase ? "#c9a84c" : p < phase ? "#444" : "#2a2a2a",
              }}>
                {p < phase ? "✓" : PHASE_META[p].label.replace("Phase ", "") || "0"}
              </div>
              {i < PHASE_ORDER.length - 1 && (
                <div style={{ width: 16, height: 1, background: "#1e1e1e" }} />
              )}
            </div>
          ))}
        </div>

        <div style={{ textAlign: "right", fontSize: 11, color: "#555" }}>
          {phaseInfo?.name}
          {profile.name && <div style={{ color: "#333" }}>{profile.name}</div>}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden", height: "calc(100vh - 57px)" }}>
        {/* CHAT */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Phase label */}
          <div style={{
            padding: "8px 24px", borderBottom: "1px solid #1a1a1a",
            background: "#0f0f0f", display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: phase === 4 ? "#c9a84c" : "#4a7c59" }} />
            <span style={{ fontSize: 11, color: "#555", letterSpacing: 1, textTransform: "uppercase" }}>
              {phaseInfo?.description}
            </span>
            {phase === 4 && (
              <span style={{ marginLeft: "auto", fontSize: 10, color: "#444" }}>
                {persona.name} · {persona.label}
              </span>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

            {phase === 0 && messages.length === 0 && (
              <div style={{ maxWidth: 480, margin: "60px auto", textAlign: "center" }}>
                <div style={{ fontSize: 26, color: "#c9a84c", marginBottom: 12, fontStyle: "italic" }}>
                  Rivaltrust Builder
                </div>
                <div style={{ fontSize: 13, color: "#555", lineHeight: 1.9, marginBottom: 28 }}>
                  A structured experience to prepare you for real conversations across deep value disagreements.
                </div>
                <div style={{ fontSize: 13, color: "#777" }}>What's your name?</div>
              </div>
            )}

            {messages.map((msg, i) => {
              const isUser = msg.role === "user";
              const isInfo = msg.role === "system-info";
              const isFacilitator = msg.speaker?.includes("Facilitator");
              const isRival = msg.speaker === persona.name;
              const isNarrator = msg.speaker === "Narrator";

              return (
                <div key={i} style={{
                  display: "flex",
                  flexDirection: isUser ? "row-reverse" : "row",
                  gap: 10,
                  alignItems: "flex-start",
                }}>
                  {!isUser && !isInfo && (
                    <div style={{
                      width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                      background: isFacilitator ? "#0a150a" : isRival ? persona.color : "#111",
                      border: `1px solid ${isFacilitator ? "#1e3a1e" : isRival ? persona.borderColor : "#222"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, color: "#555",
                    }}>
                      {msg.speaker?.includes("⚡") ? "⚡" : isRival ? persona.avatar : "F"}
                    </div>
                  )}
                  <div style={{ maxWidth: "74%" }}>
                    {msg.speaker && !isUser && (
                      <div style={{ fontSize: 9, color: "#444", marginBottom: 3, letterSpacing: 1.5, textTransform: "uppercase" }}>
                        {msg.speaker}
                      </div>
                    )}
                    <div style={{
                      padding: isNarrator ? "20px 24px" : "10px 14px",
                      borderRadius: isUser ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
                      background: isUser ? "#181818"
                        : isInfo ? "transparent"
                        : isNarrator ? "#0e0e0e"
                        : isFacilitator ? "#0a120a"
                        : isRival ? persona.color
                        : "#111",
                      border: isUser ? "1px solid #252525"
                        : isInfo ? "none"
                        : isNarrator ? "1px solid #2a2a2a"
                        : isFacilitator ? "1px solid #1a2e1a"
                        : isRival ? `1px solid ${persona.borderColor}`
                        : "1px solid #1e1e1e",
                      fontSize: isNarrator ? 13 : 14,
                      lineHeight: 1.75,
                      color: isInfo ? "#555" : "#ddd",
                      whiteSpace: "pre-wrap",
                    }}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              );
            })}

            {loading && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0" }}>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: "#111", border: "1px solid #1e1e1e",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{
                    width: 5, height: 5, borderRadius: "50%", background: "#c9a84c",
                    animation: "pulse 1s ease-in-out infinite",
                  }} />
                </div>
                <span style={{ fontSize: 11, color: "#444", fontStyle: "italic" }}>
                  {phase === 4 ? "Negotiating..." : "Thinking..."}
                </span>
              </div>
            )}

            {/* Phase complete + advance button */}
            {phaseComplete && !narrativeSummary && (
              <div style={{
                padding: "14px 18px",
                background: "#0a150a",
                border: "1px solid #1e3a1e",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}>
                <div style={{ fontSize: 12, color: "#4a7c59" }}>
                  {phase === 4
                    ? "You've completed the practice engagement."
                    : "Phase complete — ready to continue?"}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {phase === 4 && !narrativeSummary && (
                    <button onClick={generateNarrativeSummary} disabled={generatingSummary} style={{
                      padding: "7px 16px",
                      background: "transparent",
                      border: "1px solid #4a7c59",
                      borderRadius: 4,
                      color: "#4a7c59",
                      fontSize: 11,
                      cursor: "pointer",
                      letterSpacing: 1,
                    }}>
                      {generatingSummary ? "Generating..." : "Get Summary"}
                    </button>
                  )}
                  {getNextPhase(phase) !== null && (
                    <button onClick={handleAdvancePhase} style={{
                      padding: "7px 16px",
                      background: "#c9a84c",
                      border: "none",
                      borderRadius: 4,
                      color: "#0f0f0f",
                      fontSize: 11,
                      fontWeight: "bold",
                      cursor: "pointer",
                      letterSpacing: 1,
                    }}>
                      Continue →
                    </button>
                  )}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: "14px 24px",
            borderTop: "1px solid #1a1a1a",
            display: "flex", gap: 10,
          }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={
                phase === 0
                  ? onboardingStep === 0 ? "Your name..." : "Topic to explore..."
                  : phaseComplete ? "Phase complete — use the button above"
                  : "Speak your mind..."
              }
              disabled={loading || (phaseComplete && phase !== 4)}
              rows={2}
              style={{
                flex: 1,
                background: "#141414",
                border: "1px solid #222",
                borderRadius: 8,
                padding: "10px 14px",
                color: "#e8e4dc",
                fontSize: 14,
                fontFamily: "Georgia, serif",
                resize: "none",
                outline: "none",
                lineHeight: 1.6,
              }}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              style={{
                padding: "0 18px",
                background: !input.trim() || loading ? "#181818" : "#c9a84c",
                border: "none",
                borderRadius: 8,
                color: !input.trim() || loading ? "#2a2a2a" : "#0f0f0f",
                fontSize: 16,
                cursor: !input.trim() || loading ? "not-allowed" : "pointer",
                transition: "all 0.2s",
              }}
            >
              →
            </button>
          </div>
        </div>

        {/* RIGHT PANEL: Negotiation + Scores */}
        {phase >= 1 && (
          <div style={{
            width: showPanel ? 280 : 36,
            borderLeft: "1px solid #1a1a1a",
            background: "#0c0c0c",
            display: "flex",
            flexDirection: "column",
            transition: "width 0.3s ease",
            overflow: "hidden",
            flexShrink: 0,
          }}>
            <div
              onClick={() => setShowPanel(!showPanel)}
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid #1a1a1a",
                cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8,
                background: "#0e0e0e",
              }}
            >
              <span style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                {showPanel ? "◀ System" : "▶"}
              </span>
            </div>

            {showPanel && (
              <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 16 }}>

                {/* Visible Scores */}
                <div>
                  <div style={{ fontSize: 9, color: "#555", letterSpacing: 2, marginBottom: 10, textTransform: "uppercase" }}>
                    Readiness Scores
                  </div>
                  {Object.entries(scores).map(([key, val]) => (
                    <div key={key} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: "#555" }}>
                          {key.replace(/([A-Z])/g, " $1").trim()}
                        </span>
                        <span style={{ fontSize: 10, color: "#666" }}>{val}</span>
                      </div>
                      <div style={{ height: 3, background: "#1a1a1a", borderRadius: 2 }}>
                        <div style={{
                          height: "100%",
                          width: `${val}%`,
                          background: "#c9a84c",
                          borderRadius: 2,
                          transition: "width 0.5s ease",
                        }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Negotiation output (Phase 4 only) */}
                {phase === 4 && negotiation && (
                  <>
                    <div style={{ height: 1, background: "#1a1a1a" }} />

                    <div>
                      <div style={{ fontSize: 9, color: "#c94c4c", letterSpacing: 2, marginBottom: 8, textTransform: "uppercase" }}>
                        Rival Internal
                      </div>
                      <div style={{
                        background: "#0d0d1a", border: "1px solid #1a1a2e",
                        borderRadius: 6, padding: 10, fontSize: 11, color: "#556", lineHeight: 1.7,
                      }}>
                        {Object.entries(negotiation.rivalAssessment).map(([k, v]) => (
                          <div key={k}>
                            <span style={{ color: "#334" }}>{k}: </span>
                            <span style={{ color: typeof v === "boolean" ? (v ? "#4a7c59" : "#7c4a4a") : "#667" }}>
                              {String(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 9, color: "#4a7c59", letterSpacing: 2, marginBottom: 8, textTransform: "uppercase" }}>
                        Facilitator Internal
                      </div>
                      <div style={{
                        background: "#0a120a", border: "1px solid #1a2e1a",
                        borderRadius: 6, padding: 10, fontSize: 11, color: "#455", lineHeight: 1.7,
                      }}>
                        {Object.entries(negotiation.facilitatorAssessment).map(([k, v]) => (
                          <div key={k}>
                            <span style={{ color: "#233" }}>{k}: </span>
                            <span style={{
                              color: k === "intervene" ? (v ? "#c9a84c" : "#4a7c59")
                                : k === "urgency" ? (v === "high" ? "#c94c4c" : v === "medium" ? "#c9a84c" : "#4a7c59")
                                : "#556"
                            }}>
                              {String(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 9, color: "#888", letterSpacing: 2, marginBottom: 8, textTransform: "uppercase" }}>
                        Router Decision
                      </div>
                      <div style={{
                        background: "#111",
                        border: `1px solid ${negotiation.decision.speaker === "facilitator" ? "#3a2000" : "#1a1a2e"}`,
                        borderRadius: 6, padding: 10, fontSize: 11,
                        color: negotiation.decision.speaker === "facilitator" ? "#c9a84c" : "#667",
                        fontWeight: "bold",
                      }}>
                        → {negotiation.decision.speaker === "facilitator"
                          ? `Facilitator intervenes (${negotiation.decision.reason})`
                          : `Rival speaks · ${negotiation.decision.strategy || "continue"}`}
                      </div>
                    </div>
                  </>
                )}

                {phase === 4 && !negotiation && (
                  <div style={{ fontSize: 10, color: "#2a2a2a", fontStyle: "italic", textAlign: "center", paddingTop: 20 }}>
                    Negotiation output appears here after your first message in Phase 4.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 2px; }
        textarea:focus { border-color: #2e2e2e !important; }
      `}</style>
    </div>
  );
}
