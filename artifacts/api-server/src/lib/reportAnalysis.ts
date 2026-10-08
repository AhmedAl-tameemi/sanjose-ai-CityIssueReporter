import { CreateTrafficReportResponse } from "@workspace/api-zod";
import type { TrafficReportEvidence, TrafficReportOriginal } from "@workspace/db";
import { buildReportAnalysisInput, isConciseReportSummary, reportAnalysisInstructions } from "./reportSummary";

export class ReportAnalysisProviderError extends Error {
  constructor(public readonly status: number) {
    super(`AI provider returned status ${status}.`);
    this.name = "ReportAnalysisProviderError";
  }
}

/**
 * Provider failures never prevent the original report from being saved.
 * An unavailable analysis is reported explicitly, rather than invented.
 */
export async function generateReportAnalysis(
  originalReport: TrafficReportOriginal,
  evidence: Pick<TrafficReportEvidence, "type">[] = [],
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("AI analysis is not configured.");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      max_completion_tokens: 8192,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: reportAnalysisInstructions,
        },
        {
          role: "user",
          // Include incident context, but never contact values, coordinates,
          // filenames, object paths, preview tokens, or raw media.
          content: JSON.stringify(buildReportAnalysisInput(originalReport, evidence)),
        },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) throw new ReportAnalysisProviderError(response.status);
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI provider returned no analysis.");
  const result = CreateTrafficReportResponse.shape.analysis.parse(JSON.parse(content));
  if (!result || !isConciseReportSummary(result.summary) || !result.recommendedAction.trim()) {
    throw new Error("AI provider returned an invalid analysis.");
  }
  return { ...result, summary: result.summary.trim() };
}