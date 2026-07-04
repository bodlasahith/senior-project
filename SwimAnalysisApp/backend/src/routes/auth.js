/**
 * Authentication Routes
 */

const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const { protect } = require("../middleware/auth");
const { register, login, getMe, updateProfile } = require("../controllers/authController");

// Validation rules
const registerValidation = [
  body("username")
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage("Username must be 3-30 characters"),
  body("email").isEmail().normalizeEmail().withMessage("Please provide a valid email"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
];

// Public routes
router.post("/register", registerValidation, register);
router.post("/login", login);

// Protected routes
router.get("/me", protect, getMe);
router.put("/update", protect, updateProfile);

module.exports = router;
