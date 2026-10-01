// ==============================================================================
// Server-Side Content Validation
// Enforces business rules, campaign windows, and @palsofficial association
// ==============================================================================

import type { Campaign, RawInstagramItem } from '../types/index.ts';

export interface ValidationResult {
  isValid: boolean;
  isCampaignEligible: boolean;
  reasons: string[];
}

export class ContentValidator {
  private readonly targetAccounts = ['@pals.x.bmsit', 'pals.x.bmsit', 'palsxbmsit', '@palsofficial', 'palsofficial'];

  /**
   * Validates metadata structure and required fields
   */
  validateMetadata(item: RawInstagramItem): { valid: boolean; error?: string } {
    if (!item.id || typeof item.id !== 'string' || !item.id.trim()) {
      return { valid: false, error: 'Missing or invalid Instagram ID' };
    }
    if (!item.username || typeof item.username !== 'string' || !item.username.trim()) {
      return { valid: false, error: 'Missing username' };
    }
    return { valid: true };
  }

  /**
   * Verifies association with @pals.x.bmsit
   * Must mention or tag @pals.x.bmsit in the caption or text
   */
  hasPalsAssociation(item: RawInstagramItem): boolean {
    const text = (item.caption || '').toLowerCase();
    return this.targetAccounts.some((account) => text.includes(account.toLowerCase()));
  }

  /**
   * Checks whether the post falls inside an active live campaign window
   */
  isWithinCampaignWindow(
    postTimestamp: string | null | undefined,
    campaign: Campaign | null
  ): { eligible: boolean; reason?: string } {
    if (!campaign) {
      return { eligible: false, reason: 'No active campaign found' };
    }

    if (campaign.status !== 'live') {
      return { eligible: false, reason: `Campaign status is '${campaign.status}', must be 'live'` };
    }

    const postDate = postTimestamp ? new Date(postTimestamp) : new Date();
    const startDate = new Date(campaign.starts_at);
    const endDate = new Date(campaign.ends_at);

    if (postDate.getTime() < startDate.getTime()) {
      return { eligible: false, reason: 'Post timestamp is before campaign start date' };
    }

    if (postDate.getTime() > endDate.getTime()) {
      return { eligible: false, reason: 'Post timestamp is after campaign end date' };
    }

    return { eligible: true };
  }

  /**
   * Comprehensive validation run before storing and evaluating winner
   */
  validate(item: RawInstagramItem, campaign: Campaign | null): ValidationResult {
    const reasons: string[] = [];

    // 1. Required metadata
    const metaCheck = this.validateMetadata(item);
    if (!metaCheck.valid) {
      reasons.push(metaCheck.error || 'Invalid metadata');
      return { isValid: false, isCampaignEligible: false, reasons };
    }

    // 2. Tag / Mention @palsofficial check
    const hasTag = this.hasPalsAssociation(item);
    if (!hasTag) {
      reasons.push('Post does not tag or mention @palsofficial');
    }

    // 3. Campaign window eligibility
    const campaignCheck = this.isWithinCampaignWindow(item.timestamp, campaign);
    if (!campaignCheck.eligible && campaignCheck.reason) {
      reasons.push(campaignCheck.reason);
    }

    const isValid = metaCheck.valid && hasTag;
    const isCampaignEligible = isValid && campaignCheck.eligible;

    return {
      isValid,
      isCampaignEligible,
      reasons,
    };
  }
}

export const contentValidator = new ContentValidator();
