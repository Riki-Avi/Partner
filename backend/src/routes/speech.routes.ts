import express, { type NextFunction, type Request, type Response, Router } from 'express';
import {
  MAX_TRANSCRIPTION_UPLOAD_BYTES,
  TRANSCRIPTION_CONTENT_TYPES,
  speechController,
} from '../controllers/speech.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { AppError } from '../middleware/error.middleware.js';

const parseAudioUpload = express.raw({
  type: [...TRANSCRIPTION_CONTENT_TYPES],
  limit: MAX_TRANSCRIPTION_UPLOAD_BYTES,
});

/**
 * Buffers a recorded dictation clip, translating the body parser's size rejection into the public
 * error envelope so an oversized upload answers `413` instead of a generic `500`.
 */
function audioUpload(req: Request, res: Response, next: NextFunction): void {
  parseAudioUpload(req, res, (error?: unknown) => {
    if (
      error &&
      typeof error === 'object' &&
      (error as { type?: unknown }).type === 'entity.too.large'
    ) {
      next(
        new AppError('The recording is too large to transcribe', 413, 'SPEECH_UPLOAD_TOO_LARGE'),
      );
      return;
    }
    next(error);
  });
}

export const speechRouter = Router();
speechRouter.use(authMiddleware);
speechRouter.post('/synthesize', speechController.synthesize.bind(speechController));
speechRouter.post('/transcribe', audioUpload, speechController.transcribe.bind(speechController));
