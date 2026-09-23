import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import translationRouter from "./translation";
import mapsRouter from "./maps";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(translationRouter);
router.use(mapsRouter);

export default router;
