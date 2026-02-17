const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.translateDutchToEnglish = async (req, res) => {
  try {
    const { title, subtitle, description } = req.body;

    if (!title && !subtitle && !description) {
      return res.status(400).json({
        success: false,
        message: "At least one field (title, subtitle, description) is required",
      });
    }

    const prompt = `
Translate the following Dutch content to English.
Return the response strictly in JSON format like this:
{
  "title": "",
  "subtitle": "",
  "description": ""
}

Content:
Title: ${title || ""}
Subtitle: ${subtitle || ""}
Description: ${description || ""}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a professional Dutch to English translator. Always return valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.2,
    });

    const translatedText = completion.choices[0].message.content;

    // Parse safely
    let parsed;
    try {
      parsed = JSON.parse(translatedText);
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to parse translation response",
        raw: translatedText
      });
    }

    return res.json({
      success: true,
      original: { title, subtitle, description },
      translated: parsed,
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