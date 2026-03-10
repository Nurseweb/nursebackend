import { Router } from "express"
import { authMiddleware, adminMiddleware } from "../middleware/auth.js"
import { getUsers, toggleUserStatus, deleteUser, createUser, updateUser } from "../controllers/admin.controller.js"

const router = Router()

router.use(authMiddleware, adminMiddleware)

router.get("/users", getUsers)
router.post("/users", createUser)
router.patch("/users/:id/toggle", toggleUserStatus)
router.delete("/users/:id", deleteUser)
router.patch("/users/:id", authMiddleware, adminMiddleware, updateUser)


export default router