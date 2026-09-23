// Claude-powered recipe extraction for sources without schema.org markup:
// social captions, pasted text and photos of cookbook pages / handwritten cards.
import Anthropic from '@anthropic-ai/sdk';

export const RECIPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_recipe', 'title', 'servings', 'total_minutes', 'ingredients', 'steps', 'tags', 'uncertain'],
  properties: {
    is_recipe: { type: 'boolean', description: 'false when the input does not contain a recipe' },
    title: { type: 'string' },
    servings: { type: ['integer', 'null'] },
    total_minutes: { type: ['integer', 'null'] },
    ingredients: { type: 'array', items: { type: 'string' }, description: 'One ingredient per line, quantity first, exactly as a cook would write it, e.g. "2 tbsp olive oil"' },
    steps: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' }, description: 'Up to 5 short lowercase tags such as dinner, vegetarian, pasta, 30-minute' },
    uncertain: { type: 'array', items: { type: 'string' }, description: 'Anything you could not read or had to infer, e.g. "quantity of garlic not stated". Empty if nothing.' },
  },
};

const SYSTEM = `You turn messy recipe sources (social media captions, video descriptions, pasted text, photos of cookbook pages or handwritten cards) into a clean recipe.
Rules:
- Every ingredient mentioned anywhere (including only inside the steps or the caption body) must appear in the ingredients list. Missing ingredients are the most common complaint about recipe apps, so check the steps against the list before answering.
- Never invent quantities. If a quantity is not given, write the ingredient without one and add a note to "uncertain".
- Keep the author's wording for steps but drop filler, hashtags, emojis and calls to follow/like.
- Convert nothing: keep the source's units.
- If the input is not a recipe, set is_recipe to false and leave the lists empty.`;

let client;
export function aiAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

// input: { text?: string, image?: { data: base64, mediaType: 'image/jpeg'|... }, sourceUrl?: string }
export async function extractRecipeWithClaude(input) {
  client ??= new Anthropic();
  const content = [];
  if (input.image) content.push({ type: 'image', source: { type: 'base64', media_type: input.image.mediaType, data: input.image.data } });
  const hint = input.sourceUrl ? `Source: ${input.sourceUrl}\n\n` : '';
  content.push({ type: 'text', text: input.text ? `${hint}<source>\n${input.text}\n</source>` : `${hint}Extract the recipe from this photo.` });

  const response = await client.beta.messages.create({
    model: process.env.JARFUL_MODEL || 'claude-opus-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: RECIPE_SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  });

  if (response.stop_reason === 'refusal') throw new ImportError('The AI declined to process this source.', 422);
  if (response.stop_reason === 'max_tokens') throw new ImportError('That source was too long to process.', 413);
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let data;
  try { data = JSON.parse(text); } catch { throw new ImportError('Could not read the AI response, please try again.', 502); }
  return { data, usage: response.usage };
}

export class ImportError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
