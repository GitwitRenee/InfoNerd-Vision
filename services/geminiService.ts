/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Modality } from "@google/genai";
import { AspectRatio, ComplexityLevel, VisualStyle, ResearchResult, SearchResultItem, Language } from "../types";

// Create a fresh client for every request to ensure the latest API key from process.env.API_KEY is used
const getAi = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Use standard models to avoid permission issues with preview/pro models
const TEXT_MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-2.5-flash-image';
const EDIT_MODEL = 'gemini-2.5-flash-image';

const getLevelInstruction = (level: ComplexityLevel): string => {
  switch (level) {
    case 'Elementary':
      return "Target Audience: Elementary School (Ages 6-10). Design Requirements: Extra large, bold text (minimum 24pt equivalent). Bright primary colors. Simple geometric icons and illustrations. Maximum 3-5 key points. Wide spacing between elements. Playful but clear layout. Minimal technical jargon.";
    case 'High School':
      return "Target Audience: High School (Ages 14-18). Design Requirements: Clear, readable text (18-22pt equivalent). Balanced color scheme. Mix of diagrams, charts, and illustrations. Include 5-8 key concepts. Standard infographic layout with sections. Some technical terms with visual explanations.";
    case 'College':
      return "Target Audience: University/College (Ages 18-25). Design Requirements: Detailed text (14-18pt equivalent). Professional color palette. Complex diagrams, data visualizations, and cross-sections. Include 8-12 detailed points. Dense but organized layout. Technical terminology with precise labels.";
    case 'Expert':
      return "Target Audience: Industry Expert/Professional. Design Requirements: Technical precision text (12-16pt equivalent). Sophisticated color scheme or monochrome. Highly detailed schematics, blueprints, and technical diagrams. Include 12+ comprehensive points. Dense information with hierarchical organization. Advanced technical terminology and precise annotations.";
    default:
      return "Target Audience: General Public. Design Requirements: Clear, accessible design with readable text and balanced complexity.";
  }
};

const getStyleInstruction = (style: VisualStyle): string => {
  switch (style) {
    case 'Minimalist': return "Aesthetic: Bauhaus Minimalist. Flat vector art with crisp edges. Limited color palette (2-3 bold colors). Heavy use of negative white space. Simple geometric shapes (circles, squares, lines). Sans-serif typography. Grid-based layout. High contrast. Ultra-clean composition.";
    case 'Realistic': return "Aesthetic: Photorealistic Composite. Professional photography style. Natural lighting and shadows. 8K resolution detail. Highly detailed textures and materials. Depth of field. Looks like a high-end magazine photo spread with real objects and environments.";
    case 'Cartoon': return "Aesthetic: Modern Educational Comic. Vibrant saturated colors. Bold black outlines (2-3px). Cel-shaded flat colors with simple highlights. Expressive character-like elements. Dynamic compositions. Speech bubbles or callouts. Friendly and engaging visual narrative style.";
    case 'Vintage': return "Aesthetic: 19th Century Scientific Lithograph. Hand-engraved appearance. Sepia, cream, and brown tones. Aged paper texture background. Fine cross-hatching and stippling. Ornate borders and decorative elements. Classical typography. Museum-quality historical scientific illustration.";
    case 'Futuristic': return "Aesthetic: Cyberpunk HUD Interface. Dark background (black or deep blue). Glowing neon lines (cyan, blue, magenta). Holographic translucent panels. Digital grid overlays. 3D wireframe elements. Geometric tech patterns. Sci-fi dashboard aesthetic with digital readouts and data streams.";
    case '3D Render': return "Aesthetic: 3D Isometric Render. Clean isometric perspective. Smooth gradients and soft shadows. Glossy plastic or claymorphism materials. Studio lighting with rim lights. Soft ambient occlusion. Looks like a high-quality physical model or toy. Rounded corners and friendly shapes.";
    case 'Sketch': return "Aesthetic: Technical Blueprint/Da Vinci Notebook. Pen and ink style on cream parchment. Hand-drawn appearance with consistent line weight. Handwritten-style annotations and labels. Construction lines visible. Cross-sections and technical details. Looks like an architect's or inventor's working sketch.";
    default: return "Aesthetic: Modern Scientific Infographic. Clean digital illustration. Professional color palette. Clear hierarchy. Mix of icons, diagrams, and data visualizations. Contemporary design trends. Publication-quality. Balanced composition with proper spacing.";
  }
};

export const researchTopicForPrompt = async (
  topic: string,
  level: ComplexityLevel,
  style: VisualStyle,
  language: Language
): Promise<ResearchResult> => {

  const levelInstr = getLevelInstruction(level);
  const styleInstr = getStyleInstruction(style);

  const systemPrompt = `
    You are an expert visual researcher and infographic designer.
    Your goal is to research the topic: "${topic}" and create a detailed prompt for a professional infographic.

    **IMPORTANT: Use the Google Search tool to find the most accurate, up-to-date information about this topic.**

    Context:
    ${levelInstr}
    ${styleInstr}
    Language: ${language}

    Please provide your response in the following format EXACTLY:

    FACTS:
    - [Fact 1]
    - [Fact 2]
    - [Fact 3]

    IMAGE_PROMPT:
    [A highly detailed image generation prompt that must include:
    - Explicit instruction: "Create a 16:9 widescreen format infographic"
    - Overall composition and layout (horizontal panels, flowcharts, diagrams, etc.)
    - Specific visual elements (icons, charts, illustrations, data visualizations)
    - Color scheme and palette
    - Typography guidance (large, readable text in ${language})
    - Background treatment
    - Any specific design patterns appropriate for the style
    Do not include citations or references in the prompt.]
  `;

  const response = await getAi().models.generateContent({
    model: TEXT_MODEL,
    contents: systemPrompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text || "";
  
  // Parse Facts
  const factsMatch = text.match(/FACTS:\s*([\s\S]*?)(?=IMAGE_PROMPT:|$)/i);
  const factsRaw = factsMatch ? factsMatch[1].trim() : "";
  const facts = factsRaw.split('\n')
    .map(f => f.replace(/^-\s*/, '').trim())
    .filter(f => f.length > 0)
    .slice(0, 5);

  // Parse Prompt
  const promptMatch = text.match(/IMAGE_PROMPT:\s*([\s\S]*?)$/i);
  let imagePrompt = promptMatch ? promptMatch[1].trim() : `Create a detailed 16:9 widescreen format infographic about ${topic}. ${levelInstr} ${styleInstr}`;

  // Ensure aspect ratio is always specified
  if (!imagePrompt.toLowerCase().includes('16:9') && !imagePrompt.toLowerCase().includes('widescreen')) {
    imagePrompt = `Create a 16:9 widescreen format infographic. ${imagePrompt}`;
  }

  // Add quality enhancement suffix
  imagePrompt += ` High resolution, professional quality, crisp and clear details, well-balanced composition, maximum visual clarity.`;

  // Extract Grounding (Search Results)
  const searchResults: SearchResultItem[] = [];
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  
  if (chunks) {
    chunks.forEach(chunk => {
      if (chunk.web?.uri && chunk.web?.title) {
        searchResults.push({
          title: chunk.web.title,
          url: chunk.web.uri
        });
      }
    });
  }

  // Remove duplicates based on URL
  const uniqueResults = Array.from(new Map(searchResults.map(item => [item.url, item])).values());

  return {
    imagePrompt: imagePrompt,
    facts: facts,
    searchResults: uniqueResults
  };
};

export const generateInfographicImage = async (prompt: string): Promise<string> => {
  const enhancedPrompt = `${prompt}

CRITICAL REQUIREMENTS:
- Format: 16:9 aspect ratio (widescreen/landscape orientation)
- Resolution: High-definition, print-quality
- Text: All text must be large, legible, and perfectly readable
- Layout: Professional infographic design with clear visual hierarchy
- Graphics: Sharp, detailed, high-contrast elements
- Background: Clean and complementary to the content
- Overall: Publication-ready quality suitable for educational or professional use`;

  const response = await getAi().models.generateContent({
    model: IMAGE_MODEL,
    contents: {
      parts: [{ text: enhancedPrompt }]
    },
    config: {
      temperature: 0.4,
      topK: 32,
      topP: 0.95,
    }
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData && part.inlineData.data) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Failed to generate image");
};

export const verifyInfographicAccuracy = async (
  imageBase64: string, 
  topic: string,
  level: ComplexityLevel,
  style: VisualStyle,
  language: Language
): Promise<{ isAccurate: boolean; critique: string }> => {
  
  // Bypassing verification to send straight to image generation
  return {
    isAccurate: true,
    critique: "Verification bypassed."
  };
};

export const fixInfographicImage = async (currentImageBase64: string, correctionPrompt: string): Promise<string> => {
  const cleanBase64 = currentImageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');

  const prompt = `
    Edit this image. 
    Goal: Simplify and Fix.
    Instruction: ${correctionPrompt}.
    Ensure the design is clean and any text is large and legible.
  `;

  const response = await getAi().models.generateContent({
    model: EDIT_MODEL,
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
        { text: prompt }
      ]
    },
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData && part.inlineData.data) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Failed to fix image");
};

export const editInfographicImage = async (currentImageBase64: string, editInstruction: string): Promise<string> => {
  const cleanBase64 = currentImageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');

  const enhancedInstruction = `${editInstruction}

MAINTAIN QUALITY STANDARDS:
- Keep 16:9 aspect ratio
- Maintain high resolution and clarity
- Ensure all text remains large and readable
- Keep professional infographic quality
- Preserve visual hierarchy and composition balance`;

  const response = await getAi().models.generateContent({
    model: EDIT_MODEL,
    contents: {
      parts: [
         { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
         { text: enhancedInstruction }
      ]
    },
    config: {
      temperature: 0.4,
      topK: 32,
      topP: 0.95,
    }
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData && part.inlineData.data) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Failed to edit image");
};
