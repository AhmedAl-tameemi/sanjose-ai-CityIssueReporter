import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import translationRouter from "./translation";
import staffRouter from "./staff";
import reportsRouter from "./reports";
import cityIncidentsRouter from "./cityIncidents";
import cityAccidentsRouter from "./cityAccidents";

const router: IRouter = Router();

router.use(healthRouter);
router.use(staffRouter);
router.use(storageRouter);
router.use(translationRouter);
router.use(reportsRouter);
router.use(cityIncidentsRouter);
router.use(cityAccidentsRouter);

export default router;
