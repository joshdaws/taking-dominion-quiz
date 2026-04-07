import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const recordAnswer = mutation({
  args: {
    questionIndex: v.number(),
    correct: v.boolean(),
  },
  handler: async (ctx, { questionIndex, correct }) => {
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
