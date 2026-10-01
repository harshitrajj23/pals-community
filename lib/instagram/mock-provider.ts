// ==============================================================================
// Mock Instagram Provider
// For development and testing without Meta credentials (MOCK_INSTAGRAM=true)
// ==============================================================================

import type { InstagramProvider } from './provider.interface.ts';
import type { RawInstagramItem } from '../types/index.ts';

export class MockInstagramProvider implements InstagramProvider {
  readonly name = 'MockInstagramProvider';

  private mockQueue: RawInstagramItem[] = [];

  constructor() {
    this.seedDefaultItems();
  }

  private seedDefaultItems() {
    this.mockQueue = [
      {
        id: 'ig_mock_101',
        username: 'priya_codes',
        caption: 'Built a collaborative dashboard at the weekend hackathon! Tagging @palsofficial for the Tag. Post. Win. campaign 🚀 #pals #hackathon',
        media_type: 'IMAGE',
        media_url: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=800&auto=format&fit=crop',
        thumbnail_url: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=300&auto=format&fit=crop',
        permalink: 'https://instagram.com/p/mock101',
        timestamp: new Date().toISOString(),
        profile_image_url: null,
        like_count: 84,
        comments_count: 12,
      },
      {
        id: 'ig_mock_102',
        username: 'aarav_developer',
        caption: 'Attended the high-performance computing workshop organized with @palsofficial today! Amazing community. #workshop',
        media_type: 'IMAGE',
        media_url: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&auto=format&fit=crop',
        thumbnail_url: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=300&auto=format&fit=crop',
        permalink: 'https://instagram.com/p/mock102',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        profile_image_url: null,
        like_count: 42,
        comments_count: 5,
      },
    ];
  }

  /**
   * Enqueue a custom mock post for testing
   */
  enqueuePost(post: RawInstagramItem) {
    this.mockQueue.unshift(post);
  }

  async fetchTaggedPosts(_since?: string): Promise<RawInstagramItem[]> {
    // Return copy of queue
    return this.mockQueue.map((item) => ({ ...item }));
  }

  async getPostById(instagramId: string): Promise<RawInstagramItem | null> {
    const found = this.mockQueue.find((p) => p.id === instagramId);
    return found ? { ...found } : null;
  }

  verifyWebhookSignature(_signature: string, _rawBody: string): boolean {
    return true; // Always valid in mock dev mode
  }

  clearQueue() {
    this.mockQueue = [];
  }

  reset() {
    this.seedDefaultItems();
  }
}

export const mockInstagramProvider = new MockInstagramProvider();
