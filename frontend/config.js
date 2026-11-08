// MediTrack front-end settings.
// Local development uses your own computer. After you deploy the backend,
// put its https address on the "production" line (no slash at the end).
const isLocal = ["127.0.0.1", "localhost"].includes(location.hostname);

window.MEDITRACK_CONFIG = {
  BACKEND_URL: isLocal
    ? "http://127.0.0.1:8000"
    : "https://meditrack-6tmg.onrender.com", // <-- change this after deploying the backend
};
