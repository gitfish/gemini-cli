import { Content, CountTokensParameters, CountTokensResponse, EmbedContentParameters, EmbedContentResponse, FinishReason, GenerateContentParameters, GenerateContentResponse, Part } from "@google/genai";
import { ContentGeneratorConfig } from "../core/contentGenerator.js";
import { UserTierId } from "../code_assist/types.js";
import { LMStudioClient, LLM, ChatLike } from "@lmstudio/sdk";
import { partToString } from "../utils/partUtils.js";

export const createLMSContentGenerator = (config: ContentGeneratorConfig) => {
    console.log('-- LMS: Create Content Generator with config:', config);

    const client = new LMStudioClient();

    const modelState: {
        name?: string;
        p?: Promise<LLM>;
    } = {};

    const getLMSModel = async (name: string): Promise<LLM> => {
        if (modelState.name !== name) {
            if (modelState.p) {
                await (await modelState.p).unload();
            }
            modelState.name = name;
            modelState.p = client.llm.model(name);
        }
        return modelState.p!;
    }


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

    const getRequestChats = (request: GenerateContentParameters): ChatLike => {
        const arr = Array.isArray(request.contents) ? request.contents : [request.contents];
        return arr.flatMap(item => {
            if (typeof item === 'string') {
                return { text: item, role: 'user' };
            }
            if ((<Content>item).parts) {
                const c = <Content>item;
                return {
                    role: <any>(c.role === 'model' ? 'assistant' : c.role || 'user'),
                    text: partToString((<Content>item).parts!)
                };
            }
            if ((<Part>item).text) {
                return { role: 'user', text: partToString(<Part>item) };
            }
            return [];
        }).filter(p => p !== undefined);
    };

    const generateContentStream = async (request: GenerateContentParameters, userPromptId: string) => {
        console.log('-- LMS: Create Generate Content Stream', userPromptId);

        const m = await getLMSModel(request.model);
        console.log('-- Using LMS Model: ', m.displayName);
        const chats = getRequestChats(request);

        console.log('-- Chats', chats);

        return async function*() {
            for await (const item of m.respond(chats)) {
                yield {
                    text: item.content,
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
                                        text: item.content,
                                        thought: false
                                    }
                                ]
                            }
                        }
                    ]
                }
            }
            /*
            yield thought;
            yield content;
            yield finish; // Simulate a finish response
            */
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