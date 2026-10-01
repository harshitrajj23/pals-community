// ==============================================================================
// Mistral AI Post Classifier
// Invoked strictly during post ingestion (never during feed reads)
// ==============================================================================

import type { MistralClassificationResult, PostCategory } from '../types/index.ts';

const ALLOWED_CATEGORIES: PostCategory[] = [
  'Hackathon',
  'Event',
  'Workshop',
  'Project',
  'Achievement',
  'Club Activity',
  'Tech',
  'Community',
  'Other',
];

/**
 * Fast keyword heuristics used when Mistral API key is absent or network fails
 */
function fallbackKeywordClassifier(caption: string): MistralClassificationResult {
  const text = caption.toLowerCase();

  if (text.includes('hackathon') || text.includes('hack') || text.includes('codathon')) {
    return { category: 'Hackathon', confidence: 0.85 };
  }
  if (text.includes('workshop') || text.includes('bootcamp') || text.includes('training') || text.includes('hands-on')) {
    return { category: 'Workshop', confidence: 0.85 };
  }
  if (text.includes('project') || text.includes('built') || text.includes('github') || text.includes('deployed')) {
    return { category: 'Project', confidence: 0.8 };
  }
  if (text.includes('won') || text.includes('winner') || text.includes('achievement') || text.includes('certificate') || text.includes('proud')) {
    return { category: 'Achievement', confidence: 0.8 };
  }
  if (text.includes('event') || text.includes('meetup') || text.includes('conference') || text.includes('summit')) {
    return { category: 'Event', confidence: 0.8 };
  }
  if (text.includes('club') || text.includes('chapter') || text.includes('team') || text.includes('society')) {
    return { category: 'Club Activity', confidence: 0.75 };
  }
  if (text.includes('code') || text.includes('tech') || text.includes('ai') || text.includes('software') || text.includes('robotics')) {
    return { category: 'Tech', confidence: 0.75 };
  }
  if (text.includes('community') || text.includes('pals') || text.includes('network') || text.includes('friends')) {
    return { category: 'Community', confidence: 0.75 };
  }

  return { category: 'Other', confidence: 0.6 };
}

/**
 * Classifies an incoming Instagram post caption into one of the predefined categories using Mistral AI.
 * If Mistral fails or is unconfigured, falls back gracefully without halting ingestion.
 */
export async function classifyPostWithMistral(caption: string | null | undefined): Promise<MistralClassificationResult> {
  if (!caption || !caption.trim()) {
    return { category: 'Other', confidence: 1.0 };
  }

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey || apiKey === 'your_mistral_api_key_here') {
    return fallbackKeywordClassifier(caption);
  }

  const systemPrompt = `You are a strict content classification AI for the PALS Student Tech Community.
Analyze the provided Instagram post caption and classify it into EXACTLY ONE of the following categories:
- Hackathon
- Event
- Workshop
- Project
- Achievement
- Club Activity
- Tech
- Community
- Other

Return ONLY a valid JSON object in this exact schema:
{
  "category": "Hackathon",
  "confidence": 0.95
}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Caption: """${caption.slice(0, 1000)}"""` },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[MistralClassifier] API returned status ${response.status}, falling back to keyword heuristics.`);
      return fallbackKeywordClassifier(caption);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return fallbackKeywordClassifier(caption);
    }

    const parsed = JSON.parse(content);
    const category = parsed.category;
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.85;

    if (ALLOWED_CATEGORIES.includes(category)) {
      return { category: category as PostCategory, confidence };
    }

    return fallbackKeywordClassifier(caption);
  } catch (error) {
    console.warn('[MistralClassifier] Execution error, falling back to heuristics:', error);
    return fallbackKeywordClassifier(caption);
  }
}
