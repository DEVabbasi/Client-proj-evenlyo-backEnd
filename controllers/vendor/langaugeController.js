const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.translateDutchToEnglish = async (req, res) => {
  try {
    const { sentence } = req.body;

    if (!sentence) {
      return res.status(400).json({
        success: false,
        message: "Sentence is required",
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // fast & cheap model
      messages: [
        {
          role: "system",
          content: "You are a professional translator. Translate Dutch to English only. Return only the translated sentence."
        },
        {
          role: "user",
          content: sentence
        }
      ],
      temperature: 0.2,
    });

    const translatedText = completion.choices[0].message.content;

    return res.json({
      success: true,
      original: sentence,
      translated: translatedText,
    });

  } catch (error) {
    console.error("Translation error:", error);
    return res.status(500).json({
      success: false,
      message: "Translation failed",
      error: error.message,
    });
  }
};