/**
 * Frontend AI service.
 * Every call goes to the Express backend; the Gemini API key never reaches the browser.
 */

import type {
  AIActionBrief,
  AIClassificationResult,
  AIFullAnalysis,
  Complaint,
} from '../types';
import { aiApi, complaintsApi, request } from './api';

export async function analyzeComplaintPreview(complaint: {
  title: string;
  description: string;
  category: string;
  location?: { lat: number; lng: number; address?: string; ward?: string; zone?: string };
}): Promise<AIFullAnalysis> {
  const { analysis } = await aiApi.analyzePreview(complaint);
  return analysis;
}

export async function analyzeStoredComplaint(id: string): Promise<AIFullAnalysis> {
  const { analysis } = await complaintsApi.analyze(id);
  return analysis;
}

export async function classifyComplaint(title: string, description: string): Promise<AIClassificationResult> {
  return request<AIClassificationResult>('/api/ai/classify', {
    method: 'POST',
    body: JSON.stringify({ title, description }),
  });
}

export async function summarizeComplaint(description: string): Promise<string> {
  const result = await request<{ summary: string }>('/api/ai/summarize', {
    method: 'POST',
    body: JSON.stringify({ description }),
  });
  return result.summary;
}

export async function generateActionBrief(complaint: Complaint): Promise<AIActionBrief> {
  return request<AIActionBrief>('/api/ai/action-brief', {
    method: 'POST',
    body: JSON.stringify({ complaint }),
  });
}

export async function checkBackendHealth(): Promise<{
  status: string;
  aiConfigured: boolean;
  aiModel: string;
}> {
  return aiApi.health();
}
