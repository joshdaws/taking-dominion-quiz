import { mutation, query, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_PER_WINDOW = 30; // max 30 mutations per minute (generous for normal use)

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

export const recordAnswer = mutation({
  args: {
    questionIndex: v.number(),
    correct: v.boolean(),
    fingerprint: v.optional(v.string()),
  },
  handler: async (ctx, { questionIndex, correct, fingerprint }) => {
    const key = "answer:" + (fingerprint || "global");
    if (!(await checkRateLimit(ctx, key))) return;

    const existing = await ctx.db
      .query("quizStats")
      .withIndex("by_question", (q) => q.eq("questionIndex", questionIndex))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        totalAttempts: existing.totalAttempts + 1,
        correctCount: existing.correctCount + (correct ? 1 : 0),
      });
    } else {
      await ctx.db.insert("quizStats", {
        questionIndex,
        totalAttempts: 1,
        correctCount: correct ? 1 : 0,
      });
    }
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

export const recordScore = mutation({
  args: {
    score: v.number(),
    totalQuestions: v.number(),
    fingerprint: v.optional(v.string()),
  },
  handler: async (ctx, { score, totalQuestions, fingerprint }) => {
    const key = "score:" + (fingerprint || "global");
    if (!(await checkRateLimit(ctx, key))) return;

    await ctx.db.insert("quizScores", {
      score,
      totalQuestions,
      completedAt: Date.now(),
    });
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
