/**
 * Session Controller
 */

const Session = require("../models/Session");
const User = require("../models/User");

/**
 * @route   POST /api/sessions
 * @desc    Create new session
 * @access  Private
 */
exports.createSession = async (req, res) => {
  try {
    const { startTime, duration, strokes, device, environment, notes, tags } = req.body;

    // Create session
    const session = await Session.create({
      userId: req.user.id,
      startTime: startTime || Date.now(),
      duration,
      strokes: strokes || [],
      device,
      environment,
      notes,
      tags,
    });

    // Calculate efficiency if strokes exist
    if (strokes && strokes.length > 0) {
      session.calculateEfficiency();
      await session.save();
    }

    // Update user statistics
    const user = await User.findById(req.user.id);
    if (user && session.summary.totalStrokes > 0) {
      await user.updateStatistics({
        totalStrokes: session.summary.totalStrokes,
        distance: session.summary.distance || 0,
        efficiency: session.efficiency?.score || 0,
      });
    }

    res.status(201).json({
      success: true,
      session,
    });
  } catch (error) {
    console.error("Create session error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating session",
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/sessions
 * @desc    Get all sessions for current user
 * @access  Private
 */
exports.getSessions = async (req, res) => {
  try {
    const { limit = 20, skip = 0, sortBy = "startTime", order = "desc" } = req.query;

    const sessions = await Session.find({ userId: req.user.id })
      .sort({ [sortBy]: order === "desc" ? -1 : 1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .select("-strokes.sensorData -strokes.features"); // Exclude heavy data

    const total = await Session.countDocuments({ userId: req.user.id });

    res.json({
      success: true,
      count: sessions.length,
      total,
      sessions,
    });
  } catch (error) {
    console.error("Get sessions error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching sessions",
    });
  }
};

/**
 * @route   GET /api/sessions/:id
 * @desc    Get single session by ID
 * @access  Private
 */
exports.getSession = async (req, res) => {
  try {
    const session = await Session.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    res.json({
      success: true,
      session,
    });
  } catch (error) {
    console.error("Get session error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching session",
    });
  }
};

/**
 * @route   PUT /api/sessions/:id
 * @desc    Update session
 * @access  Private
 */
exports.updateSession = async (req, res) => {
  try {
    let session = await Session.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    const { notes, tags, technique, environment, duration, endTime } = req.body;

    if (notes !== undefined) session.notes = notes;
    if (tags !== undefined) session.tags = tags;
    if (technique) session.technique = { ...session.technique, ...technique };
    if (environment) session.environment = { ...session.environment, ...environment };
    if (duration !== undefined) session.duration = duration;
    if (endTime) session.endTime = endTime;

    await session.save();

    res.json({
      success: true,
      session,
    });
  } catch (error) {
    console.error("Update session error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating session",
    });
  }
};

/**
 * @route   DELETE /api/sessions/:id
 * @desc    Delete session
 * @access  Private
 */
exports.deleteSession = async (req, res) => {
  try {
    const session = await Session.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    await session.deleteOne();

    res.json({
      success: true,
      message: "Session deleted successfully",
    });
  } catch (error) {
    console.error("Delete session error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting session",
    });
  }
};

/**
 * @route   POST /api/sessions/:id/strokes
 * @desc    Add strokes to session (for real-time updates)
 * @access  Private
 */
exports.addStrokes = async (req, res) => {
  try {
    const session = await Session.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    const { strokes } = req.body;

    if (!Array.isArray(strokes)) {
      return res.status(400).json({
        success: false,
        message: "Strokes must be an array",
      });
    }

    session.strokes.push(...strokes);
    await session.save();

    res.json({
      success: true,
      message: `${strokes.length} strokes added`,
      session,
    });
  } catch (error) {
    console.error("Add strokes error:", error);
    res.status(500).json({
      success: false,
      message: "Error adding strokes",
    });
  }
};

/**
 * @route   GET /api/sessions/analytics/summary
 * @desc    Get user analytics summary
 * @access  Private
 */
exports.getAnalytics = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const sessions = await Session.find({
      userId: req.user.id,
      startTime: { $gte: startDate },
    });

    // Calculate analytics
    const analytics = {
      totalSessions: sessions.length,
      totalStrokes: 0,
      totalDuration: 0,
      avgEfficiency: 0,
      bestEfficiency: 0,
      strokeDistribution: {
        Freestyle: 0,
        Backstroke: 0,
        Breaststroke: 0,
        Butterfly: 0,
        "Front Crawl": 0,
      },
      recentSessions: sessions.slice(0, 5).map((s) => ({
        id: s._id,
        date: s.startTime,
        duration: s.duration,
        strokes: s.summary.totalStrokes,
        efficiency: s.efficiency?.score,
      })),
    };

    let totalEfficiency = 0;
    sessions.forEach((session) => {
      analytics.totalStrokes += session.summary.totalStrokes;
      analytics.totalDuration += session.duration;

      if (session.efficiency?.score) {
        totalEfficiency += session.efficiency.score;
        if (session.efficiency.score > analytics.bestEfficiency) {
          analytics.bestEfficiency = session.efficiency.score;
        }
      }

      Object.keys(session.summary.strokeCounts).forEach((stroke) => {
        analytics.strokeDistribution[stroke] += session.summary.strokeCounts[stroke];
      });
    });

    analytics.avgEfficiency = sessions.length > 0 ? totalEfficiency / sessions.length : 0;

    res.json({
      success: true,
      period: `${days} days`,
      analytics,
    });
  } catch (error) {
    console.error("Get analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching analytics",
    });
  }
};
