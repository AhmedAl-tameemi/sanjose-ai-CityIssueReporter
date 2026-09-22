import { Router, type IRouter } from "express";
import {
  TranslateReportBody,
  TranslateReportResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/translate/report", async (req, res): Promise<void> => {
  const parsed = TranslateReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid translation request." });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "English translation is not configured." });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        max_completion_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Translate the resident-entered fields into clear, faithful English for City staff. Preserve addresses, place names, dates, times, identifiers, and meaning. Do not add facts or commentary. Return only JSON with exactly these string keys: location, approximateTime, description.",
          },
          {
            role: "user",
            content: JSON.stringify(parsed.data),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      req.log.error(
        { providerStatus: response.status },
        "Translation provider request failed",
      );
      res.status(502).json({ error: "English translation could not be generated." });
      return;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      res.status(502).json({ error: "English translation could not be generated." });
      return;
    }

    const translated = TranslateReportResponse.safeParse(JSON.parse(content));
    if (!translated.success) {
      req.log.error("Translation provider returned an invalid response");
      res.status(502).json({ error: "English translation could not be generated." });
      return;
    }

    res.json(translated.data);
  } catch (error) {
    req.log.error(
      { err: error instanceof Error ? error.message : "Unknown translation error" },
      "Translation request failed",
    );
    res.status(502).json({ error: "English translation could not be generated." });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;