import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authRouter } from './routes/auth.routes.js';
import { notesRouter } from './routes/notes.routes.js';
import { tagsRouter } from './routes/tags.routes.js';
import { sharesRouter } from './routes/shares.routes.js';
import { errorMiddleware } from './middleware/error.middleware.js';

const app: Express = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/notes', notesRouter);
app.use('/api/v1/tags', tagsRouter);
app.use('/api/v1/shares', sharesRouter);
app.use('/api/v1/public', sharesRouter);

app.use(errorMiddleware);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}`);
  });
}

export { app };
