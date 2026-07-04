import { Router, type IRouter } from "express";
import healthRouter from "./health";
import vaultsRouter from "./vaults";
import activityRouter from "./activity";

const router: IRouter = Router();

router.use(healthRouter);
router.use(vaultsRouter);
router.use(activityRouter);

export default router;
