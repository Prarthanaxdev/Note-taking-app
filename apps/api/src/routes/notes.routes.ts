import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { CreateNoteSchema, UpdateNoteSchema } from 'shared';
import * as notesService from '../services/notes.service.js';

export const notesRouter: IRouter = Router();

notesRouter.post(
  '/',
  authenticate,
  validate(CreateNoteSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const note = await notesService.create(
        req.user.id,
        req.body as Parameters<typeof notesService.create>[1],
      );
      res.status(201).json(note);
    } catch (err) {
      next(err);
    }
  },
);

notesRouter.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const note = await notesService.getById(req.user.id, String(req.params.id));
      res.json(note);
    } catch (err) {
      next(err);
    }
  },
);

notesRouter.patch(
  '/:id',
  authenticate,
  validate(UpdateNoteSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const note = await notesService.update(
        req.user.id,
        String(req.params.id),
        req.body as Parameters<typeof notesService.update>[2],
      );
      res.json(note);
    } catch (err) {
      next(err);
    }
  },
);

notesRouter.delete(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await notesService.softDelete(req.user.id, String(req.params.id));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
