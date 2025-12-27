/**
 * Content Converter
 * Converts Anthropic message content to Google Generative AI parts format
 */

import { MIN_SIGNATURE_LENGTH } from '../constants.js';

/**
 * Sentinel value to skip thought signature validation for Gemini models.
 * Per Google documentation, this value can be used when Claude Code strips
 * the thoughtSignature field from tool_use blocks in multi-turn requests.
 * See: https://ai.google.dev/gemini-api/docs/thought-signatures
 */
const GEMINI_SKIP_SIGNATURE = 'skip_thought_signature_validator';

/**
 * Convert Anthropic role to Google role
 * @param {string} role - Anthropic role ('user', 'assistant')
 * @returns {string} Google role ('user', 'model')
 */
export function convertRole(role) {
    if (role === 'assistant') return 'model';
    if (role === 'user') return 'user';
    return 'user'; // Default to user
}

/**
 * Convert Anthropic message content to Google Generative AI parts
 * @param {string|Array} content - Anthropic message content
 * @param {boolean} isClaudeModel - Whether the model is a Claude model
 * @param {boolean} isGeminiModel - Whether the model is a Gemini model
 * @returns {Array} Google Generative AI parts array
 */
export function convertContentToParts(content, isClaudeModel = false, isGeminiModel = false) {
    if (typeof content === 'string') {
        return [{ text: content }];
    }

    if (!Array.isArray(content)) {
        return [{ text: String(content) }];
    }

    const parts = [];

    for (const block of content) {
        if (block.type === 'text') {
            // Skip empty text blocks - they cause API errors
            if (block.text && block.text.trim()) {
                parts.push({ text: block.text });
            }
        } else if (block.type === 'image') {
            // Handle image content
            if (block.source?.type === 'base64') {
                // Base64-encoded image
                parts.push({
                    inlineData: {
                        mimeType: block.source.media_type,
                        data: block.source.data
                    }
                });
            } else if (block.source?.type === 'url') {
                // URL-referenced image
                parts.push({
                    fileData: {
                        mimeType: block.source.media_type || 'image/jpeg',
                        fileUri: block.source.url
                    }
                });
            }
        } else if (block.type === 'document') {
            // Handle document content (e.g. PDF)
            if (block.source?.type === 'base64') {
                parts.push({
                    inlineData: {
                        mimeType: block.source.media_type,
                        data: block.source.data
                    }
                });
            } else if (block.source?.type === 'url') {
                parts.push({
                    fileData: {
                        mimeType: block.source.media_type || 'application/pdf',
                        fileUri: block.source.url
                    }
                });
            }
        } else if (block.type === 'tool_use') {
            // Convert tool_use to functionCall (Google format)
            // For Claude models, include the id field
            const functionCall = {
                name: block.name,
                args: block.input || {}
            };

            if (isClaudeModel && block.id) {
                functionCall.id = block.id;
            }

            // Build the part with functionCall
            const part = { functionCall };

            // For Gemini models, include thoughtSignature at the part level
            // This is required by Gemini 3+ for tool calls to work correctly
            if (isGeminiModel) {
                // Use thoughtSignature from the block if Claude Code preserved it
                // Otherwise, use the sentinel value to skip validation (Claude Code strips non-standard fields)
                // See: https://ai.google.dev/gemini-api/docs/thought-signatures
                part.thoughtSignature = block.thoughtSignature || GEMINI_SKIP_SIGNATURE;
            }

            parts.push(part);
        } else if (block.type === 'tool_result') {
            // Convert tool_result to functionResponse (Google format)
            let responseContent = block.content;
            if (typeof responseContent === 'string') {
                responseContent = { result: responseContent };
            } else if (Array.isArray(responseContent)) {
                const texts = responseContent
                    .filter(c => c.type === 'text')
                    .map(c => c.text)
                    .join('\n');
                responseContent = { result: texts };
            }

            const functionResponse = {
                name: block.tool_use_id || 'unknown',
                response: responseContent
            };

            // For Claude models, the id field must match the tool_use_id
            if (isClaudeModel && block.tool_use_id) {
                functionResponse.id = block.tool_use_id;
            }

            parts.push({ functionResponse });
        } else if (block.type === 'thinking') {
            // Handle thinking blocks - only those with valid signatures
            if (block.signature && block.signature.length >= MIN_SIGNATURE_LENGTH) {
                // Convert to Gemini format with signature
                parts.push({
                    text: block.thinking,
                    thought: true,
                    thoughtSignature: block.signature
                });
            }
            // Unsigned thinking blocks are dropped upstream
        }
    }

    return parts;
}
