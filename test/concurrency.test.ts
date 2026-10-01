// ==============================================================================
// PALS Community Backend Concurrency & Business Rules Test Suite
// Verifies:
// 1. Validation logic
// 2. Duplicate handling & idempotency
// 3. Simultaneous post arrival & race condition verification (EXACTLY ONE WINNER)
// 4. Post-winner arrivals
// ==============================================================================

import { repository } from '../lib/db/repository';
import { syncService } from '../lib/sync/sync-service';
import { contentValidator } from '../lib/validation/content-validator';
import { classifyPostWithMistral } from '../lib/ai/mistral-classifier';
import { RawInstagramItem } from '../types';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    if (details) console.error(`     Details: ${details}`);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('\n==================================================');
  console.log('🧪 RUNNING PALS COMMUNITY BACKEND TEST SUITE');
  console.log('==================================================\n');

  // Reset store for fresh test run
  repository.resetForTesting();

  // --------------------------------------------------------------------------
  // TEST SUITE 1: Validation & Association
  // --------------------------------------------------------------------------
  console.log('--- Test Suite 1: Content Validation ---');
  {
    const activeCampaign = await repository.getActiveCampaign();

    // 1.1 Post missing @palsofficial
    const invalidPost: RawInstagramItem = {
      id: 'ig_test_invalid_1',
      username: 'student_1',
      caption: 'Just hanging out with friends on campus! No tags here.',
      timestamp: new Date().toISOString(),
    };
    const valResult1 = contentValidator.validate(invalidPost, activeCampaign);
    assert(!valResult1.isValid, 'Post without @palsofficial is marked invalid');
    assert(valResult1.reasons.some((r) => r.includes('@palsofficial')), 'Reason explicitly mentions missing @palsofficial');

    // 1.2 Post with @palsofficial
    const validPost: RawInstagramItem = {
      id: 'ig_test_valid_1',
      username: 'student_2',
      caption: 'Loved the AI session hosted by @palsofficial! #TagPostWin',
      timestamp: new Date().toISOString(),
    };
    const valResult2 = contentValidator.validate(validPost, activeCampaign);
    assert(valResult2.isValid && valResult2.isCampaignEligible, 'Post mentioning @palsofficial is valid and campaign-eligible');
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 2: Mistral AI / Heuristic Classification
  // --------------------------------------------------------------------------
  console.log('\n--- Test Suite 2: AI Classification & Fallback ---');
  {
    const res1 = await classifyPostWithMistral('Check out our hackathon project submitted for the challenge!');
    assert(res1.category === 'Hackathon', 'Hackathon caption classified as Hackathon');

    const res2 = await classifyPostWithMistral('Attended an awesome full-day web development workshop!');
    assert(res2.category === 'Workshop', 'Workshop caption classified as Workshop');

    const res3 = await classifyPostWithMistral('Proud to have won 1st prize and certificate of achievement!');
    assert(res3.category === 'Achievement', 'Achievement caption classified as Achievement');
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 3: Idempotency & Duplicate Handling
  // --------------------------------------------------------------------------
  console.log('\n--- Test Suite 3: Deduplication & Idempotency ---');
  {
    const postItem: RawInstagramItem = {
      id: 'ig_unique_post_100',
      username: 'kabir_sharma',
      caption: 'Testing duplicate handling for @palsofficial feed',
      timestamp: new Date().toISOString(),
    };

    const firstIngest = await syncService.ingestSinglePost(postItem);
    assert(!firstIngest.isDuplicate && firstIngest.post !== null, 'First ingestion successfully stores post');

    // Attempt second ingestion with identical instagram_id
    const secondIngest = await syncService.ingestSinglePost(postItem);
    assert(secondIngest.isDuplicate, 'Second ingestion is detected as duplicate');
    assert(secondIngest.post?.id === firstIngest.post?.id, 'Returns existing record with matching database ID');

    // Ensure database still contains only 1 record for this instagram_id
    const allPosts = await repository.getAllPosts();
    const matches = allPosts.filter((p) => p.instagram_id === postItem.id);
    assert(matches.length === 1, 'Database strictly holds exactly ONE post record (no duplicates)');
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 4: SIMULTANEOUS POST ARRIVAL (RACE CONDITION & ATOMIC WINNER)
  // --------------------------------------------------------------------------
  console.log('\n--- Test Suite 4: Simultaneous Post Ingestion (Concurrency) ---');
  {
    // Create a fresh live campaign dedicated to concurrency testing
    const campaign = await repository.createCampaign({
      name: 'High Concurrency Race Test Campaign',
      status: 'live',
      starts_at: new Date(Date.now() - 60000).toISOString(),
      ends_at: new Date(Date.now() + 86400000).toISOString(),
      reward_description: 'PALS Premium Hamper',
    });

    // Make this campaign the active one in memory
    const activeCamp = await repository.getActiveCampaign();
    assert(activeCamp?.id === campaign.id || activeCamp?.status === 'live', 'Live test campaign is active');

    const CONCURRENT_POSTS_COUNT = 10;
    console.log(`  🚀 Firing ${CONCURRENT_POSTS_COUNT} simultaneous post ingestions at the exact same millisecond...`);

    const concurrentPosts: RawInstagramItem[] = Array.from({ length: CONCURRENT_POSTS_COUNT }).map((_, i) => ({
      id: `ig_race_post_${Date.now()}_${i}`,
      username: `student_concurrent_${i}`,
      caption: `Simultaneous submission #${i} for @palsofficial goodies!`,
      timestamp: new Date().toISOString(),
      media_type: 'IMAGE',
    }));

    // Ingest all 10 posts concurrently using Promise.all
    const results = await Promise.all(
      concurrentPosts.map((item) => syncService.ingestSinglePost(item))
    );

    // Count how many posts claimed winner
    const winnerResults = results.filter((r) => r.isWinner);
    console.log(`  📊 Ingestion results: ${results.length} total, ${winnerResults.length} crowned as winner.`);

    assert(
      winnerResults.length === 1,
      'EXACTLY ONE post crowned as winner among simultaneous arrivals',
      `Found ${winnerResults.length} winners instead of 1`
    );

    const winningPost = winnerResults[0].post;
    assert(winningPost !== null && winningPost.is_winner === true, 'Winning post has is_winner = true');

    // Verify database state
    const updatedCampaign = await repository.getCampaignById(campaign.id);
    assert(
      updatedCampaign?.winner_post_id === winningPost?.id,
      'Campaign winner_post_id in database matches the single winning post'
    );
    assert(
      updatedCampaign?.status === 'winner_selected',
      'Campaign status transitioned to "winner_selected"'
    );

    // Verify all other 9 posts were stored as valid approved posts with is_winner = false
    const nonWinners = results.filter((r) => !r.isWinner);
    assert(nonWinners.length === CONCURRENT_POSTS_COUNT - 1, 'All other posts were stored successfully as non-winners');
    for (const nw of nonWinners) {
      assert(nw.post?.is_winner === false, `Post ${nw.post?.id} has is_winner = false`);
      assert(nw.post?.status === 'approved', `Post ${nw.post?.id} is approved and visible on feed`);
    }

    // Test a late-arriving post after winner was selected
    const latePost: RawInstagramItem = {
      id: `ig_late_post_${Date.now()}`,
      username: 'student_late',
      caption: 'Late post tagging @palsofficial after winner already chosen',
      timestamp: new Date().toISOString(),
    };
    const lateResult = await syncService.ingestSinglePost(latePost);
    assert(!lateResult.isWinner, 'Subsequent post arriving after winner is chosen does NOT become winner');
    assert(lateResult.post?.is_winner === false, 'Late post is_winner remains false');
  }

  // --------------------------------------------------------------------------
  // TEST SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n==================================================');
  console.log(`🏁 TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
  if (passedTests === totalTests) {
    console.log('🎉 ALL BACKEND CONCURRENCY & BUSINESS TESTS PASSED!');
    console.log('==================================================\n');
    process.exit(0);
  } else {
    console.error('⚠️ SOME TESTS FAILED.');
    console.log('==================================================\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
