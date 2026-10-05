import { Router, type IRouter } from "express";
import { ListCityIncidentsQueryParams, ListCityIncidentsResponse } from "@workspace/api-zod";
import { getCityIncidents, parseMapBounds } from "../lib/cityIncidents";

const router: IRouter = Router();

router.get("/city-incidents", async (req, res): Promise<void> => {
  const parsed = ListCityIncidentsQueryParams.safeParse(req.query);
  if (!parsed.success || !parseMapBounds(parsed.data.bbox)) {
    res.status(400).json({ error: "Choose a valid map area and incident filters." });
    return;
  }
  try {
    const data = await getCityIncidents({
      bbox: parsed.data.bbox,
      year: parsed.data.year ?? "all",
      severity: parsed.data.severity ?? "all",
    });
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(ListCityIncidentsResponse.parse(data));
  } catch {
    req.log.warn("City public collision data is temporarily unavailable");
    res.status(503).json({ error: "City collision data is temporarily unavailable. Please try again." });
  }
});

export default router;
