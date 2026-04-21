const QnA = require('../../models/KnowledgeBase');
const { toMultilingualText } = require('../../utils/textUtils');

// ─── Create ──────────────────────────────────────────────────────────────────
exports.createQnA = async (req, res) => {
  try {
    const { question, answer, category, keywords, status } = req.body;

    if (!question || !answer || !category) {
      return res.status(400).json({
        success: false,
        message: 'Question, answer, and category are required',
      });
    }

    const qna = new QnA({
      question: toMultilingualText(question),
      answer:   toMultilingualText(answer),
      category,
      keywords,
      status,
    });

    await qna.save();

    res.status(201).json({
      success: true,
      message: 'Q&A entry created successfully',
      data: qna,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// ─── Get All (with search, filter, pagination) ───────────────────────────────
exports.getAllQnA = async (req, res) => {
  try {
    const {
      search   = '',
      category,
      status,
      page  = 1,
      limit = 10,
    } = req.query;

    const query = {};

    if (search.trim()) {
      query.$or = [
        { 'question.en': { $regex: search, $options: 'i' } },
        { 'question.nl': { $regex: search, $options: 'i' } },
        { 'answer.en':   { $regex: search, $options: 'i' } },
        { 'answer.nl':   { $regex: search, $options: 'i' } },
        { keywords:      { $regex: search, $options: 'i' } },
      ];
    }

    if (category && category !== 'All Categories') {
      query.category = category;
    }

    if (status && status !== 'All Status') {
      query.status = status.toLowerCase();
    }

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await QnA.countDocuments(query);
    const data  = await QnA.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data,
      pagination: {
        total,
        page:       parseInt(page),
        limit:      parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── Get Single ──────────────────────────────────────────────────────────────
exports.getQnA = async (req, res) => {
  try {
    const qna = await QnA.findById(req.params.id);
    if (!qna) {
      return res.status(404).json({ success: false, message: 'Q&A entry not found' });
    }
    res.json({ success: true, data: qna });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── Update ──────────────────────────────────────────────────────────────────
exports.updateQnA = async (req, res) => {
  try {
    const { question, answer, category, keywords, status } = req.body;

    const qna = await QnA.findById(req.params.id);
    if (!qna) {
      return res.status(404).json({ success: false, message: 'Q&A entry not found' });
    }

    if (question) qna.question = toMultilingualText(question);
    if (answer)   qna.answer   = toMultilingualText(answer);
    if (category) qna.category = category;
    if (keywords !== undefined) qna.keywords = keywords;
    if (status)   qna.status   = status;

    await qna.save();

    res.json({
      success: true,
      message: 'Q&A entry updated successfully',
      data: qna,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// ─── Delete ──────────────────────────────────────────────────────────────────
exports.deleteQnA = async (req, res) => {
  try {
    const qna = await QnA.findByIdAndDelete(req.params.id);
    if (!qna) {
      return res.status(404).json({ success: false, message: 'Q&A entry not found' });
    }
    res.json({ success: true, message: 'Q&A entry deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── Toggle Status ───────────────────────────────────────────────────────────
exports.toggleQnAStatus = async (req, res) => {
  try {
    const qna = await QnA.findById(req.params.id);
    if (!qna) {
      return res.status(404).json({ success: false, message: 'Q&A entry not found' });
    }

    qna.status = qna.status === 'active' ? 'inactive' : 'active';
    await qna.save();

    res.json({
      success: true,
      message: `Status updated to ${qna.status}`,
      data: qna,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};