import { Content, ContentListUnion, ContentUnion, CountTokensParameters, CountTokensResponse, EmbedContentParameters, EmbedContentResponse, FinishReason, GenerateContentParameters, GenerateContentResponse, Part } from "@google/genai";
import { ContentGenerator, ContentGeneratorConfig } from "../core/contentGenerator.js";
import { UserTierId } from "../code_assist/types.js";
import { LMStudioClient, LLM, ChatLike, Chat, ChatMessageInput } from "@lmstudio/sdk";
import { partToString } from "../utils/partUtils.js";

export const createLMSContentGenerator = async (config: ContentGeneratorConfig): Promise<ContentGenerator> => {
    console.log('-- LMS: Create Content Generator with config:', config);

    const client = new LMStudioClient();
    const chat = Chat.empty();

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

    let init = true;

    const getInputsForContents = (contents: ContentListUnion): ChatMessageInput[] => {
        const arr = Array.isArray(contents) ? contents : [contents];
        return arr.map(item => {
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
        }).filter(r => r !== undefined);
    };

    const getInputs = (request: GenerateContentParameters): ChatMessageInput[] => {
        return getInputsForContents(request.contents);
    };

    const getUserInputs = (request: GenerateContentParameters): ChatMessageInput[] => {
        return getInputs(request).filter(r => r.role === 'user');
    }

    const appendChats = (request: GenerateContentParameters) => {
        const userInputs = getUserInputs(request);
        if (init) {
            init = false;
            if (request.config?.systemInstruction) {
                const inputs = getInputsForContents(request.config.systemInstruction);
                for (const input of inputs) {
                    chat.append('user', input.content!);
                }
            }
            // we also append all user inputs
            for (const userInput of userInputs) {
                chat.append(userInput);
            }
        } else {
            chat.append(userInputs[userInputs.length - 1]);
        }
    };

    const generateContentStream = async (request: GenerateContentParameters, userPromptId: string) => {
        const m = await getLMSModel(request.model);

        // append chats
        appendChats(request);

        return async function*() {
            const prediction = m.respond(chat);
            for await (const { content } of prediction) {
                yield {
                    text: content,
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
                                        text: content,
                                        thought: false
                                    }
                                ]
                            }
                        }
                    ]
                };
            }
     
            const result = await prediction;
            chat.append(result.content);

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