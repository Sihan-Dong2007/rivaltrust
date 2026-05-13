# Rivaltrust Builder — Local Prototype

Multi-agent AI system for structured dialogue across value disagreements.

## Architecture

```
src/
├── api/
│   └── ollama.js              # All LLM calls (model routing lives here)
├── engines/
│   ├── phaseEngine.js         # State machine: phase transitions (pure code)
│   ├── promptEngine.js        # Assembles system prompts from building blocks
│   ├── interventionEngine.js  # Detects triggers + calls Facilitator LLM
│   └── scoringEngine.js       # Updates visible scores + hidden modifiers (pure code)
├── personas/
│   └── rivalPersonas.js       # Rival persona library (add new personas here)
├── prompts/
│   └── systemPrompts.js       # All system prompts (edit content here)
├── App.jsx                    # Main orchestrator + UI
└── index.js                   # Entry point
```

## Two LLMs, Three Roles

| Role | Model | When |
|---|---|---|
| Rival | llama3 | Every turn in Phase 4 (when Router picks Rival) |
| Facilitator | mistral | Only when Intervention Engine triggers |
| Router (assessment) | mistral | Every turn in Phase 4 (parallel, background) |

The Router runs two silent background assessments in parallel on every user message:
- **Rival Assessment**: what is the rival's internal state and strategy?
- **Facilitator Assessment**: should the facilitator intervene, and how urgently?

The Router then picks who speaks. Facilitator high/medium urgency always wins.

## Setup

### 1. Install Ollama

```bash
# Mac
brew install ollama

# Or download from: https://ollama.com
```

### 2. Pull models

```bash
ollama pull llama3    # ~4.7GB — used for Rival and Narrator
ollama pull mistral   # ~4.1GB — used for Facilitator and Router
```

Minimum 8GB RAM. Both models run fine on a standard laptop.

### 3. Start Ollama

```bash
ollama serve
# Runs on http://localhost:11434
```

### 4. Install and run the frontend

```bash
npm install
npm start
# Opens at http://localhost:3000
```

## Flow

```
Phase 0  Onboarding      Name + topic
Phase 1  Motives         3 structured questions (Facilitator guides)
Phase 2  Formation Story 3 structured questions (Facilitator guides)
Phase 4  Practice        Multi-agent rival engagement
         [optional] Narrative Mirror Summary generation
```

## Negotiation Panel (right sidebar)

In Phase 4, the right panel shows the live backend negotiation:
- **Rival Internal** — rival's emotional state, strategy, whether to yield
- **Facilitator Internal** — whether to intervene, urgency, trigger type
- **Router Decision** — who speaks and why

This is the "Method 3" multi-agent coordination described in the architecture docs.

## Adding a New Rival Persona

Edit `src/personas/rivalPersonas.js` and add a new entry to `RIVAL_PERSONAS`.
Then change `ACTIVE_PERSONA_ID` in `src/App.jsx` to use it.
No other files need to change.

## Hardware

| Model | RAM | Speed (approx) |
|---|---|---|
| mistral 7B | 8GB | 5–10s per response |
| llama3 8B | 8GB | 5–15s per response |
| llama3 70B | 48GB | Slower, higher quality |
