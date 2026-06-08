import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { CreateTagSchema, UpdateTagSchema } from 'shared';
import * as tagsService from '../services/tags.service.js';

export const tagsRouter: IRouter = Router();

tagsRouter.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tags = await tagsService.listTags(req.user.id);
      res.json(tags);
    } catch (err) {
      next(err);
    }
  },
);

tagsRouter.post(
  '/',
  authenticate,
  validate(CreateTagSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tag = await tagsService.createTag(
        req.user.id,
        req.body as Parameters<typeof tagsService.createTag>[1],
      );
      res.status(201).json(tag);
    } catch (err) {
      next(err);
    }
  },
);

tagsRouter.patch(
  '/:id',
  authenticate,
  validate(UpdateTagSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tag = await tagsService.updateTag(
        req.user.id,
        String(req.params.id),
        req.body as Parameters<typeof tagsService.updateTag>[2],
      );
      res.json(tag);
    } catch (err) {
      next(err);
    }
  },
);

tagsRouter.delete(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await tagsService.deleteTag(req.user.id, String(req.params.id));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
