import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as sharesService from '../services/shares.service.js';

export const sharesRouter: IRouter = Router();

// DELETE /api/v1/shares/:shareId — revoke a share link (auth required)
sharesRouter.delete(
  '/:shareId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await sharesService.revokeShareLink(req.user.id, String(req.params.shareId));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/public/notes/:token — public read (no auth)
// Resolved via app.use('/api/v1/public', sharesRouter) in index.ts
sharesRouter.get(
  '/notes/:token',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await sharesService.getPublicNote(String(req.params.token));
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);
