import { Router, type IRouter } from "express";
import { GetMapsConfigResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Google Maps JavaScript keys are necessarily visible to the browser. Restrict this
// key to the app's HTTP referrers and the Maps JavaScript API in Google Cloud.
router.get("/maps/config", (_req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_BROWSER_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "Google Maps is not configured." });
    return;
  }
  res.json(GetMapsConfigResponse.parse({ apiKey }));
});

export default router;