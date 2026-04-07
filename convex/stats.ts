import { mutation, query, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_PER_WINDOW = 5; // max 5 submissions per minute

async function checkRateLimit(ctx: MutationCtx, key: string): Promise<boolean> {
  const now = Date.now();
  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  if (!existing) {
    await ctx.db.insert("rateLimits", { key, count: 1, windowStart: now });
    return true;
  }

  if (now - existing.windowStart > WINDOW_MS) {
    await ctx.db.patch(existing._id, { count: 1, windowStart: now });
    return true;
  }

  if (existing.count >= MAX_PER_WINDOW) {
    return false;
  }

  await ctx.db.patch(existing._id, { count: existing.count + 1 });
  return true;
}

export const submitQuiz = mutation({
  args: {
    answers: v.array(
      v.object({
        questionIndex: v.number(),
        correct: v.boolean(),
      })
    ),
    score: v.number(),
    totalQuestions: v.number(),
    fingerprint: v.optional(v.string()),
  },
  handler: async (ctx, { answers, score, totalQuestions, fingerprint }) => {
    const key = "submit:" + (fingerprint || "global");
    if (!(await checkRateLimit(ctx, key))) return;

    // Update per-question stats
    for (const answer of answers) {
      const existing = await ctx.db
        .query("quizStats")
        .withIndex("by_question", (q) =>
          q.eq("questionIndex", answer.questionIndex)
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          totalAttempts: existing.totalAttempts + 1,
          correctCount: existing.correctCount + (answer.correct ? 1 : 0),
        });
      } else {
        await ctx.db.insert("quizStats", {
          questionIndex: answer.questionIndex,
          totalAttempts: 1,
          correctCount: answer.correct ? 1 : 0,
        });
      }
    }

    // Record final score
    await ctx.db.insert("quizScores", {
      score,
      totalQuestions,
      completedAt: Date.now(),
    });
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const stats = await ctx.db.query("quizStats").collect();
    const byQuestion: Record<number, { total: number; correct: number }> = {};
    for (const s of stats) {
      byQuestion[s.questionIndex] = {
        total: s.totalAttempts,
        correct: s.correctCount,
      };
    }
    return byQuestion;
  },
});

export const getScoreDistribution = query({
  args: { totalQuestions: v.number() },
  handler: async (ctx, { totalQuestions }) => {
    const scores = await ctx.db.query("quizScores").collect();
    const distribution: Record<number, number> = {};
    for (let i = 0; i <= totalQuestions; i++) distribution[i] = 0;
    for (const s of scores) {
      if (s.totalQuestions === totalQuestions) {
        distribution[s.score] = (distribution[s.score] || 0) + 1;
      }
    }
    const totalResponses = scores.filter(
      (s) => s.totalQuestions === totalQuestions
    ).length;
    return { distribution, totalResponses };
  },
});
