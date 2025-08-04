import { CountTokensParameters, CountTokensResponse, EmbedContentParameters, EmbedContentResponse, GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { ContentGeneratorConfig } from "../core/contentGenerator.js";
import { UserTierId } from "../code_assist/types.js";

export const createLMSContentGenerator = (config: ContentGeneratorConfig) => {
    console.log('-- Create Content Generator with config:', config);

    const generateContent = async (request: GenerateContentParameters, userPromptId: string) => {
        console.log('-- Generate Content', userPromptId);
        // Simulate content generation
        return {
            codeExecutionResult: 'yep',
            data: 'data',
            executableCode: '',
            functionCalls: [],
            text: 'This is a response part.',
            candidates: [
                {
                    content: {
                        parts: [
                            {
                                text: 'This is a response part.',
                                thought: false,
                            },
                        ],
                    }
                }
            ]
        };
    };

    const generateContentStream = async (request: GenerateContentParameters, userPromptId: string) => {
        console.log('-- Create Generate Content Stream');
        return async function*() {
            yield generateContent(request, userPromptId);
        }();
    };

    const countTokens = async (request: CountTokensParameters): Promise<CountTokensResponse> => {
        console.log('-- Count Tokens');
        // Simulate token counting
        return {
            cachedContentTokenCount: 0,
            totalTokens: 0,
        };
    };

    const embedContent = async (request: EmbedContentParameters): Promise<EmbedContentResponse> => {
        console.log('-- Embed Content');
        // Simulate content embedding
        return {
            embeddings: [],
            metadata: {},
        };
    };

    return {
        generateContent,
        generateContentStream,
        countTokens,
        embedContent,
        userTier: UserTierId.FREE
    };
};