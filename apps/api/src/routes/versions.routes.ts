import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as versionsService from '../services/versions.service.js';

export const versionsRouter: IRouter = Router({ mergeParams: true });

versionsRouter.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const versions = await versionsService.listVersions(req.user.id, String(req.params.id));
    res.json(versions);
  } catch (err) {
    next(err);
  }
});

versionsRouter.get(
  '/:versionId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const version = await versionsService.getVersion(
        req.user.id,
        String(req.params.id),
        String(req.params.versionId),
      );
      res.json(version);
    } catch (err) {
      next(err);
    }
  },
);

versionsRouter.post(
  '/:versionId/restore',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const note = await versionsService.restoreVersion(
        req.user.id,
        String(req.params.id),
        String(req.params.versionId),
      );
      res.json(note);
    } catch (err) {
      next(err);
    }
  },
);
