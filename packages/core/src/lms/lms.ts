import { CountTokensParameters, CountTokensResponse, EmbedContentParameters, EmbedContentResponse, FinishReason, GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { ContentGeneratorConfig } from "../core/contentGenerator.js";
import { UserTierId } from "../code_assist/types.js";

export const createLMSContentGenerator = (config: ContentGeneratorConfig) => {
    console.log('-- LMS: Create Content Generator with config:', config);

    const thought: GenerateContentResponse = {
        text: 'This is a thought part.',
        codeExecutionResult: undefined,
        functionCalls: undefined,
        data: undefined,
        executableCode: undefined,
        candidates: [
            {
                content: {
                    role: 'model',
                    parts: [
                        {
                            text: 'This is a thought part.',
                            thought: true
                        }
                    ]
                }
            }
        ]
    };

    const content: GenerateContentResponse = {
        text: 'This is a response part.',
        codeExecutionResult: undefined,
        functionCalls: undefined,
        data: undefined,
        executableCode: undefined,
        candidates: [
            {
                content: {
                    role: 'model',
                    parts: [
                        {
                            text: 'This is a response part.',
                            thought: false
                        }
                    ]
                }
            }
        ]
    };

    const finish: GenerateContentResponse = {
        text: 'Finished response.',
        codeExecutionResult: undefined,
        functionCalls: undefined,
        data: undefined,
        executableCode: undefined,
        candidates: [
            {
                finishReason: FinishReason.STOP,
                finishMessage: 'Done'
            }
        ]
    }

    const generateContent = async (request: GenerateContentParameters, userPromptId: string) => {
        console.log('-- LMS: Generate Content', userPromptId);
        // this is called to determine the next speaker - we're always going to return user for it
        return {
            text: `{ "next_speaker": "user" }`,
            codeExecutionResult: undefined,
            functionCalls: undefined,
            data: undefined,
            executableCode: undefined,
            candidates: [
                {
                    content: {
                        parts: [
                            {
                                text: '{ "next_speaker": "user" }',
                                thought: false
                            }
                        ]
                    }
                }
            ]
        };
    };

    const generateContentStream = async (request: GenerateContentParameters, userPromptId: string) => {
        console.log('-- LMS: Create Generate Content Stream');
        return async function*() {
            yield thought;
            yield content;
            yield finish; // Simulate a finish response
        }();
    };

    const countTokens = async (request: CountTokensParameters): Promise<CountTokensResponse> => {
        console.log('-- LMS: Count Tokens');
        // Simulate token counting
        return {
            cachedContentTokenCount: 0,
            totalTokens: 0,
        };
    };

    const embedContent = async (request: EmbedContentParameters): Promise<EmbedContentResponse> => {
        console.log('-- LMS: Embed Content');
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