/**
 * Seed: the four example flows.
 *
 *   1. Research → Write → Critique Loop      (loop + condition routing)
 *   2. Code Review Loop                      (loop + condition routing)
 *   3. Product Idea → Spec Pipeline          (4-agent sequential pipeline)
 *   4. Pet Project & Startup Idea Generator  (3-agent sequential pipeline)
 *
 * The seed is RESTORATIVE: agents/tasks/tools/flows are upserted with full
 * update payloads, and each flow's node/edge graph is deleted and rebuilt
 * from the definitions below. Re-running it resets the examples to a known
 * good state no matter what the canvas did to them.
 *
 * Run: pnpm --filter web db:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Seed data types ──────────────────────────────────────────────────────────

interface AgentSeed {
  id: string;
  name: string;
  role: string;
  goal: string;
  backstory: string;
  temperature: number;
  maxIterations: number;
  memoryScope?: string[];
  toolIds?: string[];
}

interface TaskSeed {
  id: string;
  description: string;
  expectedOutput: string;
  assignedAgentId: string;
  contextTaskIds?: string[];
  outputFormat?: "text" | "json" | "markdown-note";
}

interface NodeSeed {
  id: string;
  type: "start" | "end" | "task" | "loop" | "condition";
  positionX: number;
  positionY: number;
  label: string;
  taskId?: string;
  agentId?: string;
  loopType?: string;
  loopMax?: number;
  conditionExpr?: string;
}

interface EdgeSeed {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: "sequential" | "conditional" | "loop";
  label?: string;
}

interface FlowSeed {
  id: string;
  name: string;
  description: string;
  nodes: NodeSeed[];
  edges: EdgeSeed[];
}

// ─── Upsert helpers (real update payloads — reseeding repairs drift) ──────────

async function upsertAgent(a: AgentSeed) {
  const fields = {
    name: a.name,
    role: a.role,
    goal: a.goal,
    backstory: a.backstory,
    llmProvider: "claude-cli",
    llmModel: "claude-sonnet-4-6",
    llmParams: JSON.stringify({ temperature: a.temperature }),
    memoryScope: JSON.stringify(a.memoryScope ?? []),
    maxIterations: a.maxIterations,
    allowDelegation: false,
    verbose: true,
  };
  await prisma.agent.upsert({ where: { id: a.id }, update: fields, create: { id: a.id, ...fields } });

  // Reset tool assignments to exactly the seeded set
  await prisma.agentTool.deleteMany({ where: { agentId: a.id } });
  for (const toolId of a.toolIds ?? []) {
    await prisma.agentTool.create({ data: { agentId: a.id, toolId } });
  }
}

async function upsertTask(t: TaskSeed) {
  const fields = {
    description: t.description,
    expectedOutput: t.expectedOutput,
    assignedAgentId: t.assignedAgentId,
    contextTaskIds: JSON.stringify(t.contextTaskIds ?? []),
    outputFormat: t.outputFormat ?? "text",
    humanInTheLoop: false,
  };
  await prisma.task.upsert({ where: { id: t.id }, update: fields, create: { id: t.id, ...fields } });
}

/** Upserts the flow row, then wipes and rebuilds its graph from the seed definition. */
async function resetFlow(f: FlowSeed) {
  await prisma.flow.upsert({
    where: { id: f.id },
    update: { name: f.name, description: f.description },
    create: { id: f.id, name: f.name, description: f.description },
  });

  await prisma.flowEdge.deleteMany({ where: { flowId: f.id } });
  await prisma.flowNode.deleteMany({ where: { flowId: f.id } });

  for (const n of f.nodes) {
    await prisma.flowNode.create({
      data: {
        id: n.id,
        flowId: f.id,
        type: n.type,
        positionX: n.positionX,
        positionY: n.positionY,
        label: n.label,
        taskId: n.taskId ?? null,
        agentId: n.agentId ?? null,
        loopType: n.loopType ?? null,
        loopMax: n.loopMax ?? null,
        conditionExpr: n.conditionExpr ?? null,
      },
    });
  }
  for (const e of f.edges) {
    await prisma.flowEdge.create({
      data: {
        id: e.id,
        flowId: f.id,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        type: e.type,
        label: e.label ?? "",
      },
    });
  }

  console.log(`  ✓ Flow "${f.name}" — ${f.nodes.length} nodes, ${f.edges.length} edges`);
}

// ─── Tools ────────────────────────────────────────────────────────────────────

const TOOL_CALC = "seed-tool-calculator";
const TOOL_FETCH = "seed-tool-http-fetch";

async function seedTools() {
  const calc = {
    id: TOOL_CALC,
    name: "calculator",
    description: "Evaluate arithmetic expressions and return the numeric result",
    type: "builtin",
    argsSchema: JSON.stringify({
      type: "object",
      properties: { expression: { type: "string", description: "Math expression" } },
      required: ["expression"],
    }),
  };
  const fetchTool = {
    id: TOOL_FETCH,
    name: "http_fetch",
    description: "Fetch the content of a URL and return the response body as text",
    type: "builtin",
    argsSchema: JSON.stringify({
      type: "object",
      properties: {
        url: { type: "string" },
        method: { type: "string", enum: ["GET", "POST"] },
      },
      required: ["url"],
    }),
  };
  for (const t of [calc, fetchTool]) {
    const { id, ...fields } = t;
    await prisma.tool.upsert({ where: { name: t.name }, update: fields, create: t });
  }
  console.log("  ✓ Tools: calculator, http_fetch");
}

// ════════════════════════════════════════════════════════════════════════════
//  FLOW 1 — Research → Write → Critique Loop
//  Start → Research → Write → Loop[3x: Critique] → Condition → Approved
//                                                          └──→ Needs Revision
// ════════════════════════════════════════════════════════════════════════════

const flow1Agents: AgentSeed[] = [
  {
    id: "seed-agent-researcher",
    name: "Researcher",
    role: "Senior Research Analyst",
    goal: "Gather comprehensive, accurate information on any topic and summarize the key findings clearly",
    backstory:
      "An expert researcher who distills complex subjects into clear, actionable insights. You always cite evidence and structure findings with headings and bullet points.",
    temperature: 0.3,
    maxIterations: 8,
    memoryScope: ["research/"],
    toolIds: [TOOL_FETCH],
  },
  {
    id: "seed-agent-writer",
    name: "Writer",
    role: "Senior Content Writer",
    goal: "Transform research findings into a polished, engaging 600-800 word article",
    backstory:
      "A skilled writer who turns dense research into compelling narratives. You excel at clear structure, vivid examples, and the right tone for a technical but non-specialist audience.",
    temperature: 0.7,
    maxIterations: 5,
    memoryScope: ["research/", "drafts/"],
  },
  {
    id: "seed-agent-critic",
    name: "Critic",
    role: "Editorial Quality Assessor",
    goal: "Score the article out of 10 and provide specific, actionable feedback",
    backstory:
      "A meticulous editor who scores content on accuracy, clarity, structure, and engagement. You are direct and specific. When the article is good (score ≥ 7), you include the string QUALITY_PASS in your response. When it needs work, you include QUALITY_FAIL and list concrete improvements.",
    temperature: 0.2,
    maxIterations: 4,
    toolIds: [TOOL_CALC],
  },
];

const flow1Tasks: TaskSeed[] = [
  {
    id: "seed-task-research",
    description:
      "Research the current state of multi-agent AI systems: key frameworks (CrewAI, LangGraph, AutoGen), real-world use cases, architectural patterns, and limitations. Focus on production deployments in 2025-2026.",
    expectedOutput:
      "A structured research summary with: (1) overview of 3 major frameworks, (2) 3-5 concrete production use cases with measurable outcomes, (3) key technical limitations, (4) emerging best practices. Use headings and bullet points.",
    assignedAgentId: "seed-agent-researcher",
  },
  {
    id: "seed-task-write",
    description:
      "Using the research summary provided in context, write a 600-800 word article titled 'The Rise of Multi-Agent AI Systems'. The article should be engaging for a technical but non-specialist audience. Include: a compelling introduction, 3-4 sections with subheadings, concrete examples from the research, and a forward-looking conclusion.",
    expectedOutput:
      "A complete article in markdown format, 600-800 words, with title, introduction, 3-4 sections with subheadings, and conclusion. Each section should include at least one concrete example.",
    assignedAgentId: "seed-agent-writer",
    contextTaskIds: ["seed-task-research"],
  },
  {
    id: "seed-task-critique",
    description:
      "Critically evaluate the article provided in context. Score it from 1-10 on: accuracy, clarity, structure, and engagement. Calculate the average. If the average score is 7 or higher, include the exact text QUALITY_PASS in your response. If below 7, include QUALITY_FAIL and list 3-5 specific improvements needed.",
    expectedOutput:
      "A critique containing: per-dimension scores (accuracy/clarity/structure/engagement), the average score, either QUALITY_PASS or QUALITY_FAIL, and actionable improvement suggestions if score < 7.",
    assignedAgentId: "seed-agent-critic",
    contextTaskIds: ["seed-task-write"],
  },
];

const flow1: FlowSeed = {
  id: "seed-flow-rwc",
  name: "Research → Write → Critique Loop",
  description:
    "Researcher gathers information, Writer drafts an article, then the Critic reviews it up to 3 times. A condition node routes to Approved or Needs Revision based on QUALITY_PASS/FAIL in the critique.",
  nodes: [
    { id: "seed-node-start", type: "start", positionX: 40, positionY: 330, label: "Start" },
    { id: "seed-node-task-research", type: "task", positionX: 240, positionY: 300, label: "Research", taskId: "seed-task-research", agentId: "seed-agent-researcher" },
    { id: "seed-node-task-write", type: "task", positionX: 540, positionY: 300, label: "Write Article", taskId: "seed-task-write", agentId: "seed-agent-writer" },
    { id: "seed-node-loop", type: "loop", positionX: 840, positionY: 315, label: "Review Loop", loopType: "fixed-n", loopMax: 3 },
    { id: "seed-node-task-critique", type: "task", positionX: 1140, positionY: 90, label: "Critique", taskId: "seed-task-critique", agentId: "seed-agent-critic" },
    {
      id: "seed-node-condition", type: "condition", positionX: 1140, positionY: 500, label: "Score ≥ 7?",
      conditionExpr: "Object.values(outputs).some(function(v){ return String(v).indexOf('QUALITY_PASS') !== -1; })",
    },
    { id: "seed-node-end-pass", type: "end", positionX: 1440, positionY: 420, label: "Approved" },
    { id: "seed-node-end-fail", type: "end", positionX: 1440, positionY: 640, label: "Needs Revision" },
  ],
  edges: [
    { id: "seed-edge-start-research", sourceNodeId: "seed-node-start", targetNodeId: "seed-node-task-research", type: "sequential" },
    { id: "seed-edge-research-write", sourceNodeId: "seed-node-task-research", targetNodeId: "seed-node-task-write", type: "sequential" },
    { id: "seed-edge-write-loop", sourceNodeId: "seed-node-task-write", targetNodeId: "seed-node-loop", type: "sequential" },
    { id: "seed-edge-loop-body", sourceNodeId: "seed-node-loop", targetNodeId: "seed-node-task-critique", type: "loop", label: "body" },
    { id: "seed-edge-loop-exit", sourceNodeId: "seed-node-loop", targetNodeId: "seed-node-condition", type: "sequential", label: "exit" },
    { id: "seed-edge-cond-true", sourceNodeId: "seed-node-condition", targetNodeId: "seed-node-end-pass", type: "conditional", label: "true" },
    { id: "seed-edge-cond-false", sourceNodeId: "seed-node-condition", targetNodeId: "seed-node-end-fail", type: "conditional", label: "false" },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
//  FLOW 2 — Code Review Loop
//  Start → Write Code → Loop[3x: Code Review] → Condition → Ship It
//                                                       └──→ Needs Rework
// ════════════════════════════════════════════════════════════════════════════

const flow2Agents: AgentSeed[] = [
  {
    id: "seed2-agent-developer",
    name: "Developer",
    role: "Senior Software Engineer",
    goal: "Write clean, correct, well-documented code and improve it based on review feedback",
    backstory:
      "An experienced engineer who writes production-quality code with proper error handling, type hints, and docstrings. When given reviewer feedback, you carefully apply every suggestion and produce an improved version of the full code.",
    temperature: 0.2,
    maxIterations: 6,
  },
  {
    id: "seed2-agent-reviewer",
    name: "Code Reviewer",
    role: "Principal Engineer & Code Quality Expert",
    goal: "Thoroughly review code and score it; approve only when it meets production standards",
    backstory:
      "A principal engineer who reviews code for correctness, security, style, and documentation quality. You score code 1-10 across four dimensions and calculate the average. If the average is 8 or higher you include the exact string CODE_APPROVED in your response. Otherwise you include CODE_NEEDS_WORK followed by specific, numbered improvement instructions that the developer can act on immediately.",
    temperature: 0.1,
    maxIterations: 4,
  },
];

const flow2Tasks: TaskSeed[] = [
  {
    id: "seed2-task-write-code",
    description:
      "Write a Python implementation of a Least Recently Used (LRU) cache class. Requirements: O(1) get and put operations, capacity limit, evicts the least recently used item when full, full type hints, docstrings for every method, and example usage in a __main__ block. Do not use collections.OrderedDict — implement it from scratch using a doubly-linked list and hash map.",
    expectedOutput:
      "Complete, runnable Python code for an LRU cache class with all requirements met. Include a brief explanation of the approach before the code block.",
    assignedAgentId: "seed2-agent-developer",
  },
  {
    id: "seed2-task-review-code",
    description:
      "Review the code provided in context. Score it 1–10 on each of: (1) Correctness — does the logic actually implement LRU correctly? (2) Code Style — PEP 8, naming, clarity. (3) Documentation — docstrings, comments, example. (4) Robustness — edge cases, type safety, error handling. Calculate the average score. If average ≥ 8: write CODE_APPROVED and a brief summary of strengths. If average < 8: write CODE_NEEDS_WORK, list specific numbered improvements, then write the COMPLETE improved code incorporating all fixes.",
    expectedOutput:
      "Scores for each dimension, average score, either CODE_APPROVED or CODE_NEEDS_WORK, and (if CODE_NEEDS_WORK) the complete improved code.",
    assignedAgentId: "seed2-agent-reviewer",
    contextTaskIds: ["seed2-task-write-code"],
  },
];

const flow2: FlowSeed = {
  id: "seed2-flow-code-review",
  name: "Code Review Loop",
  description:
    "Developer writes an LRU cache implementation, then the Code Reviewer critiques it up to 3 times. Each iteration the developer applies feedback. A condition checks for CODE_APPROVED to route to Ship It or Needs Rework.",
  nodes: [
    { id: "seed2-n-start", type: "start", positionX: 40, positionY: 310, label: "Start" },
    { id: "seed2-n-write", type: "task", positionX: 240, positionY: 280, label: "Write Code", taskId: "seed2-task-write-code", agentId: "seed2-agent-developer" },
    { id: "seed2-n-loop", type: "loop", positionX: 540, positionY: 295, label: "Review Loop", loopType: "fixed-n", loopMax: 3 },
    { id: "seed2-n-review", type: "task", positionX: 840, positionY: 80, label: "Code Review", taskId: "seed2-task-review-code", agentId: "seed2-agent-reviewer" },
    {
      id: "seed2-n-cond", type: "condition", positionX: 840, positionY: 480, label: "Approved?",
      conditionExpr: "Object.values(outputs).some(function(v){ return String(v).indexOf('CODE_APPROVED') !== -1; })",
    },
    { id: "seed2-n-ship", type: "end", positionX: 1140, positionY: 400, label: "Ship It ✅" },
    { id: "seed2-n-rework", type: "end", positionX: 1140, positionY: 620, label: "Needs Rework" },
  ],
  edges: [
    { id: "seed2-e-start-write", sourceNodeId: "seed2-n-start", targetNodeId: "seed2-n-write", type: "sequential" },
    { id: "seed2-e-write-loop", sourceNodeId: "seed2-n-write", targetNodeId: "seed2-n-loop", type: "sequential" },
    { id: "seed2-e-loop-body", sourceNodeId: "seed2-n-loop", targetNodeId: "seed2-n-review", type: "loop", label: "body" },
    { id: "seed2-e-loop-exit", sourceNodeId: "seed2-n-loop", targetNodeId: "seed2-n-cond", type: "sequential", label: "exit" },
    { id: "seed2-e-cond-true", sourceNodeId: "seed2-n-cond", targetNodeId: "seed2-n-ship", type: "conditional", label: "true" },
    { id: "seed2-e-cond-false", sourceNodeId: "seed2-n-cond", targetNodeId: "seed2-n-rework", type: "conditional", label: "false" },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
//  FLOW 3 — Product Idea → Spec Pipeline
//  Start → Ideate → Validate → Write Spec → Feasibility → Done
// ════════════════════════════════════════════════════════════════════════════

const flow3Agents: AgentSeed[] = [
  {
    id: "seed3-agent-innovator",
    name: "Innovator",
    role: "Product Ideation Specialist",
    goal: "Generate focused, high-potential product ideas grounded in real market problems",
    backstory:
      "A creative product strategist who has worked at top tech companies and startups. You generate ideas that are specific, feasible, and grounded in real pain points. You avoid vague generalities and always connect ideas to concrete user problems.",
    temperature: 0.8,
    maxIterations: 4,
  },
  {
    id: "seed3-agent-analyst",
    name: "Market Analyst",
    role: "Senior Market Research Analyst",
    goal: "Validate product ideas with rigorous market analysis and competitive intelligence",
    backstory:
      "A data-driven analyst who evaluates product ideas on market size, competitive landscape, and timing. You select the strongest idea from the list provided and back every claim with reasoning. You are direct about risks and do not sugarcoat weak opportunities.",
    temperature: 0.3,
    maxIterations: 5,
  },
  {
    id: "seed3-agent-pm",
    name: "Product Manager",
    role: "Senior Product Manager",
    goal: "Translate validated ideas into actionable one-page product specs that engineering can build from",
    backstory:
      "A PM with 10 years experience shipping B2B SaaS products. You write specs that are tight, unambiguous, and prioritized. You always include measurable success metrics and a realistic MVP scope that can be built in 90 days.",
    temperature: 0.4,
    maxIterations: 5,
  },
  {
    id: "seed3-agent-architect",
    name: "Tech Architect",
    role: "Principal Software Architect",
    goal: "Assess technical feasibility, estimate effort, and identify the key engineering risks",
    backstory:
      "A principal architect who has designed systems at scale. Given a product spec you identify: the core technical components, estimated team size and timeline, top 3 engineering risks with mitigations, and a recommended tech stack. You are honest about complexity and flag anything that could blow the timeline.",
    temperature: 0.2,
    maxIterations: 4,
  },
];

const flow3Tasks: TaskSeed[] = [
  {
    id: "seed3-task-ideate",
    description:
      "Generate 3 specific, high-potential B2B SaaS product ideas for the AI-first developer tooling space in 2026. For each idea provide: (1) a punchy product name, (2) the exact pain point it solves and who suffers from it, (3) the core value proposition in one sentence, (4) the primary revenue model, (5) why now is the right time to build it.",
    expectedOutput:
      "Three well-developed product ideas, each covering: name, pain point, target customer, value proposition, revenue model, and timing rationale. Format each idea with a clear heading.",
    assignedAgentId: "seed3-agent-innovator",
  },
  {
    id: "seed3-task-validate",
    description:
      "Review the three product ideas in context. Select the single most promising one and provide a thorough market validation: (1) estimated addressable market size with reasoning, (2) three main competitors and how this product differs, (3) two key risks and how to mitigate them, (4) ideal first customer profile (company size, role, industry), (5) a score out of 10 for market opportunity with justification.",
    expectedOutput:
      "Market validation report for the chosen idea: selected idea name, market size estimate, competitor analysis, risk assessment, ICP description, and opportunity score with rationale.",
    assignedAgentId: "seed3-agent-analyst",
    contextTaskIds: ["seed3-task-ideate"],
  },
  {
    id: "seed3-task-spec",
    description:
      "Using the validated product idea from context, write a one-page product specification. Include: (1) executive summary (2-3 sentences), (2) problem statement, (3) five user stories in 'As a [user], I want to [action] so that [benefit]' format, (4) MVP feature list (max 5 features, each with a brief description), (5) three measurable success metrics for the first 6 months, (6) a 90-day roadmap broken into three 30-day milestones.",
    expectedOutput:
      "A complete one-page product spec in structured markdown: executive summary, problem statement, user stories, MVP features, success metrics, and 90-day roadmap.",
    assignedAgentId: "seed3-agent-pm",
    contextTaskIds: ["seed3-task-validate"],
    outputFormat: "markdown-note",
  },
  {
    id: "seed3-task-feasibility",
    description:
      "Review the product spec in context and provide a technical feasibility assessment: (1) core technical components needed (list each with 1-sentence description), (2) recommended tech stack with justification, (3) estimated team size and time to MVP, (4) top 3 engineering risks with specific mitigation strategies, (5) an overall feasibility rating: High / Medium / Low with a one-paragraph justification.",
    expectedOutput:
      "Technical feasibility report: component list, tech stack recommendation, team/timeline estimate, top risks with mitigations, and overall feasibility rating with justification.",
    assignedAgentId: "seed3-agent-architect",
    contextTaskIds: ["seed3-task-spec"],
  },
];

const flow3: FlowSeed = {
  id: "seed3-flow-product-pipeline",
  name: "Product Idea → Spec Pipeline",
  description:
    "Four-agent sequential pipeline: Innovator generates product ideas, Market Analyst picks and validates the best one, PM writes a one-page spec, Tech Architect assesses feasibility. The spec is auto-saved as a vault note.",
  nodes: [
    { id: "seed3-n-start", type: "start", positionX: 40, positionY: 310, label: "Start" },
    { id: "seed3-n-ideate", type: "task", positionX: 240, positionY: 280, label: "Ideate", taskId: "seed3-task-ideate", agentId: "seed3-agent-innovator" },
    { id: "seed3-n-validate", type: "task", positionX: 540, positionY: 280, label: "Validate", taskId: "seed3-task-validate", agentId: "seed3-agent-analyst" },
    { id: "seed3-n-spec", type: "task", positionX: 840, positionY: 280, label: "Write Spec", taskId: "seed3-task-spec", agentId: "seed3-agent-pm" },
    { id: "seed3-n-feasible", type: "task", positionX: 1140, positionY: 280, label: "Feasibility", taskId: "seed3-task-feasibility", agentId: "seed3-agent-architect" },
    { id: "seed3-n-end", type: "end", positionX: 1440, positionY: 310, label: "Done" },
  ],
  edges: [
    { id: "seed3-e-start-ideate", sourceNodeId: "seed3-n-start", targetNodeId: "seed3-n-ideate", type: "sequential" },
    { id: "seed3-e-ideate-validate", sourceNodeId: "seed3-n-ideate", targetNodeId: "seed3-n-validate", type: "sequential" },
    { id: "seed3-e-validate-spec", sourceNodeId: "seed3-n-validate", targetNodeId: "seed3-n-spec", type: "sequential" },
    { id: "seed3-e-spec-feasible", sourceNodeId: "seed3-n-spec", targetNodeId: "seed3-n-feasible", type: "sequential" },
    { id: "seed3-e-feasible-end", sourceNodeId: "seed3-n-feasible", targetNodeId: "seed3-n-end", type: "sequential" },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
//  FLOW 4 — Pet Project & Startup Idea Generator
//  Start → Brainstorm → Triage → Curate → Done
// ════════════════════════════════════════════════════════════════════════════

const flow4Agents: AgentSeed[] = [
  {
    id: "seed4-agent-brainstormer",
    name: "Brainstormer",
    role: "Creative Technologist & Idea Generator",
    goal: "Generate a diverse spread of software project ideas, from quick weekend pet projects to scalable startup concepts",
    backstory:
      "A prolific hacker who ships side projects constantly and has also founded companies. You generate ideas that are specific and buildable, never vague. You deliberately mix small, fun, low-stakes projects with bigger, market-driven ones so there's something for every mood and ambition level.",
    temperature: 0.9,
    maxIterations: 4,
  },
  {
    id: "seed4-agent-triager",
    name: "Idea Triager",
    role: "Feasibility & Opportunity Analyst",
    goal: "Score each idea on solo buildability and market potential, then surface the single best pick in each category",
    backstory:
      "A pragmatic analyst who has both shipped weekend hacks and evaluated startup pitches. You are blunt about which ideas are actually buildable solo in under three weeks versus which have real market legs. You never let novelty alone justify a high score.",
    temperature: 0.3,
    maxIterations: 5,
  },
  {
    id: "seed4-agent-curator",
    name: "Idea Curator",
    role: "Technical Writer & Project Planner",
    goal: "Turn the selected picks into two concrete, actionable briefs the user can start building from today",
    backstory:
      "A writer who turns fuzzy ideas into crisp build plans. For pet projects you focus on fun and a fast path to a demo. For startups you focus on the smallest possible validation step. You never pad with fluff.",
    temperature: 0.4,
    maxIterations: 5,
  },
];

const flow4Tasks: TaskSeed[] = [
  {
    id: "seed4-task-brainstorm",
    description:
      "Generate 8 diverse software project ideas for a solo developer skilled in TypeScript, React, Node, and AI/LLM tooling. Mix scales deliberately: some should be small weekend/hobby pet projects (fun, learning-focused, no business model required), others should be scalable startup ideas (real market, monetizable). For each idea give: (1) a punchy name, (2) a one-line pitch, (3) why it's interesting or timely, (4) a scale tag of either 'Pet Project' or 'Startup'.",
    expectedOutput:
      "8 ideas, each with name, one-line pitch, rationale, and a Pet Project / Startup scale tag.",
    assignedAgentId: "seed4-agent-brainstormer",
  },
  {
    id: "seed4-task-triage",
    description:
      "Review the 8 ideas in context. For each, score 1-10 on (a) solo buildability in under 3 weeks, and (b) market/startup potential. Reclassify the scale tag if the scores contradict it. Then select the single best Pet Project idea and the single best Startup idea overall.",
    expectedOutput:
      "A scored table of all 8 ideas (buildability score, market score, final classification), followed by a clearly labeled pick of the best Pet Project idea and the best Startup idea, each with a 2-sentence justification.",
    assignedAgentId: "seed4-agent-triager",
    contextTaskIds: ["seed4-task-brainstorm"],
  },
  {
    id: "seed4-task-curate",
    description:
      "Using the analyst's picks in context, write a final two-part idea brief. PART 1 — Pet Project: name, why it's fun/worth building, suggested tech stack, and a weekend-sized build plan (3-5 bullet steps). PART 2 — Startup Idea: name, problem and target customer, value proposition in one sentence, MVP scope (max 4 features), and a concrete first validation step to try this week.",
    expectedOutput:
      "A markdown document with two clearly headed sections, 'Pet Project Pick' and 'Startup Pick', each fully fleshed out per the instructions.",
    assignedAgentId: "seed4-agent-curator",
    contextTaskIds: ["seed4-task-triage"],
    outputFormat: "markdown-note",
  },
];

const flow4: FlowSeed = {
  id: "seed4-flow-pet-startup-ideas",
  name: "Pet Project & Startup Idea Generator",
  description:
    "Three-agent sequential pipeline: Brainstormer generates a mix of weekend pet-project and startup ideas, Idea Triager scores and picks the best of each, Idea Curator writes an actionable build brief for both. The brief is auto-saved as a vault note.",
  nodes: [
    { id: "seed4-n-start", type: "start", positionX: 40, positionY: 310, label: "Start" },
    { id: "seed4-n-brainstorm", type: "task", positionX: 240, positionY: 280, label: "Brainstorm", taskId: "seed4-task-brainstorm", agentId: "seed4-agent-brainstormer" },
    { id: "seed4-n-triage", type: "task", positionX: 540, positionY: 280, label: "Triage", taskId: "seed4-task-triage", agentId: "seed4-agent-triager" },
    { id: "seed4-n-curate", type: "task", positionX: 840, positionY: 280, label: "Curate", taskId: "seed4-task-curate", agentId: "seed4-agent-curator" },
    { id: "seed4-n-end", type: "end", positionX: 1140, positionY: 310, label: "Done" },
  ],
  edges: [
    { id: "seed4-e-start-brainstorm", sourceNodeId: "seed4-n-start", targetNodeId: "seed4-n-brainstorm", type: "sequential" },
    { id: "seed4-e-brainstorm-triage", sourceNodeId: "seed4-n-brainstorm", targetNodeId: "seed4-n-triage", type: "sequential" },
    { id: "seed4-e-triage-curate", sourceNodeId: "seed4-n-triage", targetNodeId: "seed4-n-curate", type: "sequential" },
    { id: "seed4-e-curate-end", sourceNodeId: "seed4-n-curate", targetNodeId: "seed4-n-end", type: "sequential" },
  ],
};

// ─── Vault note ───────────────────────────────────────────────────────────────

async function seedVaultNote() {
  const body = [
    "# Multi-Agent AI Systems — Overview",
    "",
    "A starter reference note. The Researcher agent will expand upon this.",
    "",
    "## Key Frameworks",
    "",
    "- **CrewAI** — role-based agents with structured task delegation",
    "- **LangGraph** — stateful graph-based multi-agent workflows",
    "- **AutoGen** — conversational multi-agent framework by Microsoft",
    "- **agent-company** — visual canvas-first orchestration (this project)",
    "",
    "## Production Use Cases",
    "",
    "- Automated research pipelines (this flow!)",
    "- Code generation + review loops",
    "- Customer support with escalation routing",
    "",
    "## See Also",
    "",
    "- [[agent-design-patterns]]",
    "- [[tool-use-strategies]]",
    "- [[loop-patterns]]",
  ].join("\n");

  await prisma.vaultNote.upsert({
    where: { path: "research/multi-agent-overview.md" },
    update: {},
    create: {
      path: "research/multi-agent-overview.md",
      title: "Multi-Agent AI Systems — Overview",
      tags: JSON.stringify(["ai", "agents", "research", "frameworks"]),
      frontmatter: JSON.stringify({ status: "seed", created: "2026-06-29" }),
      body,
    },
  });
  console.log("  ✓ Vault note: research/multi-agent-overview.md");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱  Seeding database…");

  await seedTools();

  const allAgents = [...flow1Agents, ...flow2Agents, ...flow3Agents, ...flow4Agents];
  const allTasks = [...flow1Tasks, ...flow2Tasks, ...flow3Tasks, ...flow4Tasks];

  for (const a of allAgents) await upsertAgent(a);
  console.log(`  ✓ Agents: ${allAgents.length}`);

  for (const t of allTasks) await upsertTask(t);
  console.log(`  ✓ Tasks: ${allTasks.length}`);

  for (const f of [flow1, flow2, flow3, flow4]) await resetFlow(f);

  await seedVaultNote();

  console.log("\n✅  Seed complete. Re-run any time to restore the example flows.");
  console.log("   Open canvas → load any flow → click Run to demo.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
