
import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  // Handle CORS for development or cross-origin usage
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Get the API Key from the SERVER environment variables
    const apiKey = process.env.API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Server API key not configured' });
    }

    // 2. Initialize Gemini
    const ai = new GoogleGenAI({ apiKey });
    
    // 3. Extract parameters from the request body
    const { model, contents, config } = req.body;

    // 4. Call the API
    const response = await ai.models.generateContent({
      model: model || 'gemini-2.5-flash',
      contents,
      config
    });

    // 5. Return the result
    // Note: The SDK response object might contain getters, so we ensure it's serialized properly
    // Usually response.text is what we want, but we return the full candidates structure to be flexible
    return res.status(200).json({
      text: response.text, // Extract text explicitly to simplify client handling
      candidates: response.candidates,
      usageMetadata: response.usageMetadata
    });

  } catch (error) {
    console.error("Gemini Proxy Error:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
