import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  quizStats: defineTable({
    questionIndex: v.number(),
    totalAttempts: v.number(),
    correctCount: v.number(),
  }).index("by_question", ["questionIndex"]),
  quizScores: defineTable({
    score: v.number(),
    totalQuestions: v.number(),
    completedAt: v.number(),
  }),
  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    windowStart: v.number(),
  }).index("by_key", ["key"]),
});
