import OpenAI from "openai";
import { env } from "../config/env";
import { logger } from "../lib/logger";

export interface AIAnalysisInput {
  title: string;
  description: string;
  statusCode?: number | null;
  responseTimeMs?: number;
  url?: string;
}

export interface AIAnalysisResult {
  rootCause: string;
  fixSuggestion: string;
}

let openaiClient: OpenAI | null = null;

if (env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim() !== "") {
  try {
    openaiClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  } catch (err: any) {
    logger.error(`[AI Service] Failed to initialize OpenAI client: ${err.message}`);
  }
}

/**
 * Fallback AI analysis using heuristic rule engine when OpenAI API key is missing or call fails.
 */
function fallbackAnalysis(input: AIAnalysisInput): AIAnalysisResult {
  const { title, description, statusCode, responseTimeMs, url } = input;
  const content = `${title} ${description}`.toLowerCase();

  let rootCause = "Unspecified service degradation or unexpected runtime error detected.";
  let fixSuggestion = "Inspect server application logs, check system metrics, and verify service deployment health.";

  if (statusCode === 500 || content.includes("500") || content.includes("internal server error")) {
    rootCause = `Uncaught application exception or internal server error (HTTP 500) occurring at ${url || "the application endpoint"}.`;
    fixSuggestion = "Check application error logs for unhandled stack traces, database connectivity failures, or unhandled promise rejections.";
  } else if (statusCode === 502 || content.includes("502") || content.includes("bad gateway")) {
    rootCause = `Reverse proxy or load balancer unable to establish communication with upstream application server (HTTP 502 Bad Gateway).`;
    fixSuggestion = "Verify downstream backend process status (PM2/Docker/Node.js), check port binding, and review upstream load balancer configuration.";
  } else if (statusCode === 503 || content.includes("503") || content.includes("service unavailable")) {
    rootCause = `Target service is temporarily unavailable or overloaded (HTTP 503 Service Unavailable).`;
    fixSuggestion = "Check server CPU/memory consumption, scale application instances, or review rate limiting and maintainence flags.";
  } else if (statusCode === 504 || content.includes("504") || content.includes("gateway timeout") || content.includes("timeout")) {
    rootCause = `Gateway or proxy request timed out waiting for backend response (HTTP 504 Gateway Timeout / Connection Timeout).`;
    fixSuggestion = "Optimize slow database queries, check for deadlocks or slow external API integrations, and increase proxy timeout thresholds if needed.";
  } else if (statusCode === 404 || content.includes("404") || content.includes("not found")) {
    rootCause = `Endpoint route or requested resource not found (HTTP 404 Not Found) at target URL ${url || ""}.`;
    fixSuggestion = "Verify routing table configurations, check deployment path aliases, and confirm API endpoint URL parameter correctness.";
  } else if (statusCode === 401 || statusCode === 403 || content.includes("unauthorized") || content.includes("forbidden")) {
    rootCause = `Authentication or permission failure (HTTP ${statusCode || "401/403"}) preventing request processing.`;
    fixSuggestion = "Verify environment API keys, bearer token authorization headers, and IAM permission scopes.";
  } else if (content.includes("database") || content.includes("prisma") || content.includes("postgres") || content.includes("connection pool")) {
    rootCause = `Database connectivity bottleneck, connection pool exhaustion, or query failure.`;
    fixSuggestion = "Check PostgreSQL database server status, review connection pool limits, and inspect active database locks or long-running queries.";
  } else if (content.includes("memory") || content.includes("oom") || content.includes("heap")) {
    rootCause = `Application memory leak or Out-Of-Memory (OOM) heap limit reached.`;
    fixSuggestion = "Inspect heap snapshots for memory leaks, increase Node.js memory allocation (--max-old-space-size), or restart app container.";
  } else if (responseTimeMs && responseTimeMs > 3000) {
    rootCause = `High latency bottleneck detected (Response time: ${responseTimeMs}ms exceeds normal threshold).`;
    fixSuggestion = "Analyze APM tracing metrics, optimize database indexing, and implement response caching layers.";
  }

  return { rootCause, fixSuggestion };
}

/**
 * Analyzes an incident using OpenAI GPT API (or fallback heuristics if key is unconfigured/error occurs).
 */
export async function analyzeIncidentWithAI(input: AIAnalysisInput): Promise<AIAnalysisResult> {
  if (!openaiClient) {
    logger.info("[AI Service] OpenAI API key not provided or client inactive. Using heuristic analysis fallback.");
    return fallbackAnalysis(input);
  }

  try {
    const prompt = `You are an expert Reliability Engineer (SRE) and System Diagnostics AI.
Analyze the following incident report and provide:
1. "rootCause": A concise, clear 1-2 sentence explanation of the probable root cause.
2. "fixSuggestion": A concise, actionable 1-3 step troubleshooting and fix suggestion for the engineering team.

Incident Details:
- Title: ${input.title}
- Description: ${input.description}
${input.statusCode ? `- HTTP Status Code: ${input.statusCode}` : ""}
${input.responseTimeMs ? `- Latency/Response Time: ${input.responseTimeMs}ms` : ""}
${input.url ? `- Affected Target URL: ${input.url}` : ""}

Respond ONLY in valid JSON format with keys "rootCause" and "fixSuggestion".`;

    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional SRE incident diagnostic AI. Always respond in JSON format." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI API");
    }

    const parsed = JSON.parse(content);
    if (!parsed.rootCause || !parsed.fixSuggestion) {
      throw new Error("Invalid response structure from OpenAI API");
    }

    return {
      rootCause: parsed.rootCause,
      fixSuggestion: parsed.fixSuggestion,
    };
  } catch (err: any) {
    logger.error(`[AI Service Error] Failed to generate AI analysis via OpenAI API: ${err.message}. Falling back to heuristics.`);
    return fallbackAnalysis(input);
  }
}
