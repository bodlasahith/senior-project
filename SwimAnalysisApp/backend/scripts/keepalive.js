/**
 * MongoDB Atlas keep-alive ping.
 *
 * Atlas pauses free-tier (M0) clusters after ~60 days with no connections.
 * Opening a connection and issuing a trivial command resets that timer, so
 * running this on a schedule (see .github/workflows/mongodb-keepalive.yml)
 * keeps the cluster from being paused.
 *
 * Reads the connection string from MONGODB_URI (same var the app uses).
 * Exits 0 on a successful ping, non-zero otherwise so CI surfaces failures.
 */

const mongoose = require("mongoose");

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("❌ MONGODB_URI is not set.");
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 30000,
    });

    // Trivial command that counts as cluster activity.
    const res = await mongoose.connection.db.admin().ping();

    console.log(
      `✅ Keep-alive ping ok — host: ${mongoose.connection.host}, db: ${mongoose.connection.name}, ping: ${JSON.stringify(res)}`
    );
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error("❌ Keep-alive ping failed:", err.message);
    try {
      await mongoose.connection.close();
    } catch (_) {
      /* ignore */
    }
    process.exit(1);
  }
})();
