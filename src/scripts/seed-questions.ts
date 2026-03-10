import { Pool } from "pg"
import * as fs from "fs"
import * as path from "path"
import * as dotenv from "dotenv"

dotenv.config()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

async function seedQuestions() {
  const filePath = path.join(__dirname, "../../data/questions.json")
  const raw = fs.readFileSync(filePath, "utf-8")
  const questions = JSON.parse(raw)

  console.log(`📥 ${questions.length} асуулт олдлоо...`)

  let inserted = 0
  let skipped = 0
  let errors = 0

  for (const q of questions) {
    try {
      const result = await pool.query(
        `INSERT INTO questions 
          (category, question_en, question_mn, options, correct, explanation_mn, explanation_en)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [
          q.category ?? "general",
          q.question_en,
          q.question_mn ?? "",
          JSON.stringify(q.options),
          q.correct,      
          q.explanation_mn ?? null,
          q.explanation_en ?? null,
        ]
      )

      if (result.rowCount === 0) {
        skipped++
      } else {
        inserted++
      }

      if ((inserted + skipped) % 50 === 0) {
        console.log(`  ✓ ${inserted + skipped} боловсруулсан...`)
      }
    } catch (err: any) {
      errors++
      console.error(`❌ Алдаа [${q.question_en?.slice(0, 40)}]: ${err.message}`)
    }
  }

  console.log(`\n✅ Нэмэгдсэн: ${inserted}`)
  console.log(`⏭️  Давхардсан: ${skipped}`)
  if (errors > 0) console.log(`❌ Алдаатай: ${errors}`)
  console.log(`📊 Нийт: ${inserted + skipped}`)

  await pool.end()
}

seedQuestions().catch(console.error)