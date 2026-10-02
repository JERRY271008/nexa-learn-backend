const express = require('express');
const multer = require('multer');
const controller = require('../controllers/aiController');

// Files are kept in memory (not written to disk) since we only ever read
// small text files out of them; capped at 5MB to keep requests cheap.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = express.Router();

router.post('/chat', controller.chat);
router.post('/quiz-hint', controller.quizHint);
router.post('/analyze-material', upload.single('file'), controller.analyzeMaterial);
router.post('/insights', controller.insights);
router.post('/recommendation', controller.recommendation);

module.exports = router;
