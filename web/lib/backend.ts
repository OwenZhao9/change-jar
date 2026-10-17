import { CONTRACT_ADDRESS, USE_MEMORY } from './config';
import { createChainBackend } from './chainBackend';
import { createMemBackend } from './memBackend';
import type { Backend } from './types';

export function createBackend(): Backend | null {
  if (CONTRACT_ADDRESS) return createChainBackend();
  if (USE_MEMORY) return createMemBackend();
  return null;
}
