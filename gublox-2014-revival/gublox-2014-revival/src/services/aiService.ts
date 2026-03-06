import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function askAssistant(prompt: string, context: string = "") {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: `Você é o Assistente Inteligente do Gublox, um jogo estilo Roblox. Você é bom, rápido, forte e inteligente. Responda de forma curta e amigável. Contexto: ${context}` },
            { text: prompt }
          ]
        }
      ],
      config: {
        maxOutputTokens: 200,
        temperature: 0.7,
      }
    });
    return response.text;
  } catch (error) {
    console.error("Erro no Assistente AI:", error);
    return "Desculpe, estou processando muitas informações agora. Tente novamente em breve!";
  }
}
