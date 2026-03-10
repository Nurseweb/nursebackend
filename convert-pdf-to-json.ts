/**
 * PDF → questions.json converter
 * Ажиллуулах: npx tsx convert-pdf-to-json.ts ./your-questions.pdf
 *
 * Шаардлага:
 *   npm install @anthropic-ai/sdk pdf-parse
 *   ANTHROPIC_API_KEY=... эсвэл .env файлд
 */

import Anthropic from "@anthropic-ai/sdk"
import * as fs from "fs"
import * as path from "path"
import * as dotenv from "dotenv"

dotenv.config()

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Types ──
interface Option {
  key: string
  en: string
  mn: string
}

interface Question {
  category: string
  question_en: string
  question_mn: string
  options: Option[]
  correct: string
  explanation_mn: string | null
  explanation_en: string | null
}

// ── PDF текстийг Claude-аар parse хийх ──
async function parseChunkWithClaude(textChunk: string, chunkIndex: number): Promise<Question[]> {
  console.log(`  🤖 Chunk ${chunkIndex} Claude-аар боловсруулж байна...`)

  const prompt = `You are extracting NCLEX-RN practice questions from raw PDF text.

The PDF contains questions in this format (may vary slightly):
- Question number and text in English and/or Mongolian
- 4 answer options labeled A, B, C, D
- Correct answer marked with ✅ or "Correct:" or "Зөв:"  
- Explanation in Mongolian (Тайлбар:) and/or English

Extract ALL questions from the text below and return a JSON array. For each question:
- "category": guess from content (priority/pharmacology/safety/infection/delegation/cardiac/respiratory/neuro/general)
- "question_en": English question text
- "question_mn": Mongolian question text (empty string "" if not present)
- "options": array of {key, en, mn} — key is A/B/C/D, en=English option, mn=Mongolian option (empty string if not present)
- "correct": the correct answer key (A/B/C/D)
- "explanation_mn": Mongolian explanation text (null if not present)
- "explanation_en": English explanation text (null if not present)

IMPORTANT:
- Return ONLY a valid JSON array, no markdown, no extra text
- If a question has only one language, use "" for the missing language fields
- Do not skip any questions
- If you cannot determine the correct answer, use "A" as fallback

TEXT TO PARSE:
${textChunk}`

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    })

    const raw = response.content[0] && response.content[0].type === "text" ? response.content[0].text : ""
    
    // JSON цэвэрлэх
    const cleaned = raw
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim()

    const parsed = JSON.parse(cleaned)
    console.log(`  ✓ Chunk ${chunkIndex}: ${parsed.length} асуулт олдлоо`)
    return parsed
  } catch (err) {
    console.error(`  ❌ Chunk ${chunkIndex} parse алдаа:`, err)
    return []
  }
}

// ── Текстийг chunk болгон хувааx ──
function splitIntoChunks(text: string, chunkSize = 6000): string[] {
  const chunks: string[] = []
  
  // Асуултын тоогоор хуваах оролдлого (Q: эсвэл тоогоор эхэлсэн мөр)
  const questionPattern = /(?=\n(?:Q\d+|Question\s+\d+|\d+\.))/gi
  const parts = text.split(questionPattern)
  
  let currentChunk = ""
  for (const part of parts) {
    if ((currentChunk + part).length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim())
      currentChunk = part
    } else {
      currentChunk += part
    }
  }
  if (currentChunk.trim()) chunks.push(currentChunk.trim())
  
  // Хэт богино chunk-уудыг нэгтгэх
  const merged: string[] = []
  let temp = ""
  for (const c of chunks) {
    if ((temp + c).length < chunkSize) {
      temp += "\n\n" + c
    } else {
      if (temp) merged.push(temp.trim())
      temp = c
    }
  }
  if (temp) merged.push(temp.trim())
  
  return merged.length > 0 ? merged : [text]
}

// ── Давхардал арилгах ──
function deduplicateQuestions(questions: Question[]): Question[] {
  const seen = new Set<string>()
  return questions.filter(q => {
    const key = q.question_en.toLowerCase().slice(0, 80)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ── Үндсэн функц ──
async function convertPDFToJSON(pdfPath: string) {
  console.log(`\n📄 PDF уншиж байна: ${pdfPath}`)
  
  if (!fs.existsSync(pdfPath)) {
    console.error("❌ Файл олдсонгүй:", pdfPath)
    process.exit(1)
  }

  // PDF текст гаргах
  let text = ""
  try {
    // pdf-parse ашиглан текст гаргана
    const pdfParse = require("pdf-parse")
    const buffer = fs.readFileSync(pdfPath)
    const data = await pdfParse(buffer)
    text = data.text
    console.log(`✓ PDF уншлаа — ${text.length} тэмдэгт, ${data.numpages} хуудас`)
  } catch (err) {
    console.error("❌ PDF уншихад алдаа:", err)
    console.log("\n💡 Шийдэл: npm install pdf-parse")
    process.exit(1)
  }

  if (!text.trim()) {
    console.error("❌ PDF текст хоосон байна. Зураг PDF байж болзошгүй.")
    console.log("💡 Зираг PDF бол OCR хийх шаардлагатай (tesseract, Adobe Acrobat)")
    process.exit(1)
  }

  // Chunk болгон хуваах
  const chunks = splitIntoChunks(text, 5000)
  console.log(`\n📦 ${chunks.length} chunk болгон хуваалаа`)

  // Claude-аар боловсруулах
  const allQuestions: Question[] = []
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    if (!chunk) continue
    const questions = await parseChunkWithClaude(chunk, i + 1)
    allQuestions.push(...questions)
    
    // Rate limit хамгаалалт
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  // Давхардал арилгах
  const unique = deduplicateQuestions(allQuestions)
  console.log(`\n📊 Нийт: ${allQuestions.length} → давхардал арилгасны дараа: ${unique.length}`)

  // Файл хадгалах
  const outputDir = path.dirname(pdfPath)
  const outputPath = path.join(outputDir, "questions.json")
  
  fs.writeFileSync(outputPath, JSON.stringify(unique, null, 2), "utf-8")
  
  console.log(`\n✅ Амжилттай хадгаллаа: ${outputPath}`)
  console.log(`📝 Нийт ${unique.length} асуулт`)
  
  // Дэлгэрэнгүй статистик
  const categories: Record<string, number> = {}
  for (const q of unique) {
    categories[q.category] = (categories[q.category] ?? 0) + 1
  }
  console.log("\n📈 Категориор:")
  Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => console.log(`  ${cat}: ${count}`))

  // Жишээ асуулт харуулах
  if (unique.length > 0) {
    console.log("\n🔍 Жишээ (1-р асуулт):")
    console.log(JSON.stringify(unique[0], null, 2))
  }
  
  return outputPath
}

// ── Ажиллуулах ──
const pdfPath = process.argv[2]
if (!pdfPath) {
  console.log("Хэрэглэх: npx tsx convert-pdf-to-json.ts ./questions.pdf")
  process.exit(1)
}

convertPDFToJSON(path.resolve(pdfPath)).catch(console.error)