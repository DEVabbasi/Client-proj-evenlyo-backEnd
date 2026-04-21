const express = require('express');
const router  = express.Router();
const qnaController = require('../../controllers/admin/knowledgeBaseController');

// CRUD
router.post('/admin/qna/create',          qnaController.createQnA);
router.get('/admin/qna/fetch',            qnaController.getAllQnA);
router.get('/admin/qna/:id',              qnaController.getQnA);
router.put('/admin/qna/update/:id',       qnaController.updateQnA);
router.delete('/admin/qna/delete/:id',    qnaController.deleteQnA);

// Toggle status
router.post('/admin/qna/:id/toggle-status', qnaController.toggleQnAStatus);

module.exports = router;