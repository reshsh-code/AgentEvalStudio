# AgentEval Studio

**A domain-agnostic multi-agent orchestration system that generates, evaluates, and compares AI outputs using a planner–researcher–writer–critic pipeline with built-in observability and scoring.**

![Status](https://img.shields.io/badge/status-live-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## What this is

AgentEval Studio is a configurable LLM pipeline where any structured task — fitness planning, financial analysis, healthcare research, product strategy — flows through the same four-stage prompt chain. Each run produces a structured output and an automated quality evaluation. The domain is a configuration variable. The pipeline architecture is constant.

The goal is not to build a smarter chatbot. It is to make AI output generation **observable, scoreable, and comparable across runs.**

---

## Problem statement

Agent systems produce plausible outputs with no built-in accountability or evaluation loop.

A generated fitness plan may be incomplete. A financial summary may omit key risk factors. A product recommendation may lack prioritization logic. In each case, the model produced a response — but there is no mechanism to assess whether that response met the task requirements, or to identify which stage of the pipeline caused a quality issue.

AgentEval Studio treats evaluation as a first-class architectural component, not an afterthought.

---

## Pipeline architecture

All tasks move through the same four-stage prompt chain:

```
[User Task + Domain Config]
        ↓
  Stage 1: Planner       → decomposes task into 2–3 subtasks; outputs structured JSON
        ↓
  Stage 2: Researcher    → generates domain-relevant content per subtask; outputs structured JSON
        ↓
  Stage 3: Writer        → synthesizes subtask outputs into a final response; outputs structured JSON
        ↓
  Stage 4: Critic        → scores final response using LLM-as-judge heuristics; outputs structured JSON
        ↓
  Evaluation Dashboard   → trace view, quality scores, token usage, latency, run history, comparison mode
```

Each stage is a discrete API call with a distinct system prompt. Outputs are structured JSON, passed as input to the next stage. There is no dynamic tool use or external retrieval in v1.

Agents are **prompt-conditioned per domain** — not autonomous systems with domain knowledge. Each domain supplies a set of four system prompts that shape how each stage interprets and responds to the task.

---

## Domain configuration

Each domain is defined by four system prompts — one per pipeline stage — loaded at runtime. No changes to the orchestration layer are required to add a new domain.

| Domain | Example task |
|--------|-------------|
| 🏋️ Fitness | "Design a 12-week training program for fat loss" |
| 📈 Finance | "Compare index fund vs. real estate allocation for a 30-year-old" |
| 🏥 Healthcare | "Summarize lifestyle interventions that reduce type 2 diabetes risk" |
| 🧭 Product | "Outline an AI feature roadmap for an early-stage B2B SaaS" |

---

## Evaluation approach

The Critic stage uses an **LLM-as-judge** pattern: the model is prompted to evaluate its own pipeline output against four heuristic criteria.

| Criterion | What is assessed |
|-----------|-----------------|
| Completeness | Does the response address all components of the original task? |
| Correctness | Is the content factually plausible and internally consistent? |
| Clarity | Is the response well-structured and easy to follow? |
| Hallucination risk | Does the response make claims that appear unsupported or overconfident? |

**Limitation to note:** LLM-as-judge is heuristic scoring, not objective truth verification. The critic reflects the model's self-assessment, which can be inconsistent across runs and tends to favour well-structured text regardless of factual accuracy. Scores are useful for comparing runs and surfacing obvious quality issues — not for confirming correctness against a ground truth.

---

## Comparison mode

Beyond single-run evaluation, AgentEval supports **side-by-side comparison** of different pipeline configurations:

- Planner prompt variant A vs. B
- Strict critic vs. lenient critic
- Full 4-stage pipeline vs. writer-only shortcut

This is what makes it a platform rather than just a pipeline. Instead of guessing which configuration performs better, you can measure it directly across the same task.

---

## Product decisions and tradeoffs

### Separating domain context from orchestration logic
Locking the pipeline to one domain early would limit reuse. Separating domain system prompts from pipeline structure allows the same codebase to serve multiple task types without architectural changes. The tradeoff: domain-specific prompts require careful tuning. A generic prompt conditions the model less precisely and produces lower-quality outputs.

### Critic as an inline pipeline stage
Running evaluation inside the pipeline rather than as a separate post-process means quality signals are available immediately after each run. The tradeoff is increased latency and token cost — roughly 25% more per run. For a research tool this is acceptable. At production scale, evaluation would likely run asynchronously or be sampled rather than applied to every call.

### Trace as primary UI, not debug tool
Each stage output is surfaced in the default view alongside the final response. This is a transparency-first design decision: users need to see where a response came from to assess whether to trust it. Hiding intermediate outputs produces a cleaner interface but removes the information needed to diagnose quality issues. In AI products, trust is a function of explainability — not just output quality.

### Run history tracked from session start
A single quality score has no context. Tracking scores across runs — even within a session — makes pipeline performance trends visible. This turns evaluation from a one-time check into an iteration tool.

### Minimal orchestration layer, built from primitives
The pipeline uses direct API calls with structured JSON handoffs rather than an existing agent framework. This was a deliberate scoping decision: building the orchestration layer from primitives made it easier to understand exactly where failures occur and what each stage contributes. For production systems, a framework like LangGraph or LlamaIndex would add reliability and observability tooling that this implementation lacks.

---

## Known limitations and v2 priorities

**No persistent memory across sessions.** Each run starts with no context from prior runs. Agents do not retain user preferences, prior task outputs, or session history. For use cases requiring continuity, a memory layer — for example, vector store retrieval of prior runs — would be required. This is the most significant gap between v1 and a production-grade system.

**LLM-as-judge reliability.** Critic scores are model-generated and subject to the same failure modes as any LLM output: inconsistency across runs, sensitivity to prompt phrasing, and inability to verify factual claims against external sources. A more robust evaluation layer would combine LLM scoring with deterministic heuristics and, where possible, human feedback.

**No cost-aware routing.** Every task — simple or complex — runs the full four-stage pipeline. A production system would route low-complexity tasks to a shorter, cheaper path and reserve the full pipeline for tasks where quality risk justifies the cost.

**Failure taxonomy not yet defined.** The critic currently returns a summary note on issues. A v2 would classify failures by type — incomplete task decomposition, retrieval gap, unsupported claim, unclear output — so that each failure type maps to a specific remediation path.

---

## Stack

- **Frontend:** React + Tailwind CSS
- **AI:** Claude API (`claude-sonnet-4`) via Anthropic SDK
- **Orchestration:** Custom minimal layer (direct API calls + structured JSON handoffs)
- **Deployment:** Vercel

---

## Run locally

```bash
git clone https://github.com/yourusername/agenteval-studio
cd agenteval-studio
npm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env
npm run dev
```

Open `http://localhost:3000`.

---


