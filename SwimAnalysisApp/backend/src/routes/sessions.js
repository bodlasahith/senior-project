/**
 * Session Routes
 */

const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const {
  createSession,
  getSessions,
  getSession,
  updateSession,
  deleteSession,
  addStrokes,
  getAnalytics,
} = require("../controllers/sessionController");

// All routes are protected
router.use(protect);

// Session CRUD
router.route("/").get(getSessions).post(createSession);

router.route("/:id").get(getSession).put(updateSession).delete(deleteSession);

// Add strokes to active session
router.post("/:id/strokes", addStrokes);

// Analytics
router.get("/analytics/summary", getAnalytics);

module.exports = router;
