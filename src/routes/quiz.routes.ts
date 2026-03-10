// backend/src/routes/quiz.routes.ts
import { Router } from "express";
import type { Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { pool } from "../config/db.js";

interface Option {
  key: string;
  en: string;
  mn: string;
}

const router = Router();

// GET /api/quiz/questions?lang=mn&count=10&category=all
router.get(
  "/questions",
  authMiddleware,
  async (req: Request, res: Response) => {
    const lang = (req.query.lang as string) || "mn";
    const count = Math.min(parseInt(req.query.count as string) || 10, 50);
    const category = req.query.category as string;

    try {
      const whereClause =
        category && category !== "all" ? `WHERE category = $2` : "";
      const values =
        category && category !== "all" ? [count, category] : [count];

      const result = await pool.query(
        `SELECT id, category, question_en, question_mn, options, correct, explanation_mn, explanation_en
       FROM questions
       ${whereClause}
       ORDER BY RANDOM()
       LIMIT $1`,
        values,
      );

      // Lang-аас хамааран зөвхөн хэрэгтэй талбарыг буцаана
      const questions = result.rows.map((q) => ({
        id: q.id,
        category: q.category,
        question_en: q.question_en,
        question_mn: q.question_mn,
        options: q.options.map((o: Option) => ({
          key: o.key,
          en: o.en,
          mn: o.mn || "", // хоосон бол хоосон string
        })),
        correct: q.correct,
        explanation_mn: q.explanation_mn,
        explanation_en: q.explanation_en,
      }));

      res.json(questions);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Серверийн алдаа." });
    }
  },
);

export default router;
