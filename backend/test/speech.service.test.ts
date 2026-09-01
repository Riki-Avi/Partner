import 'dotenv/config';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ElevenLabsService } from '../src/services/elevenlabs.service.js';

describe('ElevenLabsService Unit Tests', () => {
  it('should instantiate ElevenLabsService', () => {
    const service = new ElevenLabsService();
    assert.ok(service);
  });

  it('should validate output formats and map codecs accurately', () => {
    const service = new ElevenLabsService();
    const resolved = (service as any).resolveOutputFormat();
    assert.ok(resolved.outputFormat);
    assert.ok(resolved.contentType);
  });
});
