import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import { initDB } from "./config/db.js"
import authRoutes from "./routes/auth.routes.js"
import adminRoutes from "./routes/admin.routes.js"
import quizRoutes from "./routes/quiz.routes.js"
import path from "path"

dotenv.config()

const app = express()
const PORT = process.env.PORT ?? 5000

app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://nurseweb.vercel.app",      // ← таны Vercel URL
    "https://nurse-web.vercel.app",     // ← эсвэл ийм байж болно
  ],
  credentials: true,
}))
app.use(express.json())

app.use("/api/auth", authRoutes)
app.use("/api/admin", adminRoutes)
app.use("/api/quiz", quizRoutes)
app.use("/pdfs", express.static(path.join(__dirname, "../public/pdfs")))

app.get("/api/health", (_, res) => res.json({ status: "ok" }))

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server: http://localhost:${PORT}`)
  })
})