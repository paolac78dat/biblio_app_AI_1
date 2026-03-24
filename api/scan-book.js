export const config = {
  runtime: "nodejs"
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type"); }

function json(res, status, payload) {
  setCors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const { image_base64, mime_type } = req.body || {};

    if (!image_base64) {
      return json(res, 400, { error: "image_base64 mancante" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return json(res, 500, { error: "OPENAI_API_KEY non configurata" });
    }

    const inputImageUrl = `data:${mime_type || "image/jpeg"};base64,${image_base64}`;

    const prompt = `
Analizza la foto di una copertina di libro.
Estrai, se possibile:
- title
- author
- genre

Regole:
- Rispondi SOLO con JSON valido
- Non aggiungere testo fuori dal JSON
- Se non sei sicuro di un campo, usa stringa vuota
- Il JSON deve avere esattamente queste chiavi:
{
  "title": "",
  "author": "",
  "genre": ""
}
`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: inputImageUrl }
            ]
          }
        ]
      })
    });

    const raw = await response.text();

    if (!response.ok) {
      return json(res, 500, {
        error: "Errore OpenAI",
        details: raw
      });
    }

    const data = JSON.parse(raw);

    let rawText = "";

    if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (!Array.isArray(item.content)) continue;
        for (const c of item.content) {
          if (c.type === "output_text" && c.text) {
            rawText += c.text;
          }
        }
      }
    }

    rawText = rawText.trim();

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return json(res, 500, {
        error: "Risposta AI non in JSON valido",
        raw: rawText
      });
    }

    return json(res, 200, {
      title: parsed.title || "",
      author: parsed.author || "",
      genre: parsed.genre || ""
    });
  } catch (error) {
    return json(res, 500, {
      error: "Errore interno",
      details: error.message || String(error)
    });
  }
}
