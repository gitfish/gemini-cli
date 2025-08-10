import { Content, ContentListUnion, CountTokensParameters, CountTokensResponse, EmbedContentParameters, EmbedContentResponse, FinishReason, GenerateContentParameters, GenerateContentResponse, Part } from "@google/genai";
import { ContentGenerator, ContentGeneratorConfig } from "../core/contentGenerator.js";
import { UserTierId } from "../code_assist/types.js";
import { LMStudioClient, LLM, Chat, ChatMessageInput } from "@lmstudio/sdk";
import { partToString } from "../utils/partUtils.js";
import { Config } from '../config/config.js';
import { on, EventEmitter } from "events";

export const createLMSContentGenerator = async (
    config: ContentGeneratorConfig,
    gcConfig: Config,
    sessionId?: string): Promise<ContentGenerator> => {
    
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
    };

    const toolRegistry = await gcConfig.getToolRegistry();

    for (const t of toolRegistry.getAllTools()) {
        console.log('-- Tool: ' + t.displayName + ' - ' + t.description);
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
                return { content: item, role: 'user' };
            }
            if ((<Content>item).parts) {
                const c = <Content>item;
                return {
                    role: <any>(c.role === 'model' ? 'assistant' : c.role || 'user'),
                    content: partToString((<Content>item).parts!)
                };
            }
            if ((<Part>item).text) {
                return { role: 'user', content: partToString(<Part>item) };
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
        console.log('-- Append User Inputs', JSON.stringify(userInputs, null, 2));
        if (init) {
            init = false;
            /* look at implementing this in a different way
            if (request.config?.systemInstruction) {
                const inputs = getInputsForContents(request.config.systemInstruction);
                console.log('-- System instruction inputs', JSON.stringify(inputs, null, 2));
                for (const input of inputs) {
                    chat.append('user', input.content!);
                }
            }
            */
            // we also append all user inputs
            for (const userInput of userInputs) {
                chat.append(userInput);
            }
        } else {
            chat.append(userInputs[userInputs.length - 1]);
        }
    };

    const generateContentStream = async (request: GenerateContentParameters, _userPromptId: string) => {
        const signal = request.config?.abortSignal;
        
        const m = await getLMSModel(request.model);

        // append chats
        appendChats(request);

        return async function*() {
            const r = new EventEmitter();

            m.act(chat, [], {
                signal,
                onMessage(message) {
                    chat.append(message)
                },
                onPredictionFragment(f) {
                    r.emit('content', {
                        text: f.content,
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
                                            text: f.content,
                                            thought: false // maybe this is considered a thought
                                        }
                                    ]
                                }
                            }
                        ]
                    });
                }
            }).then(() => {
                console.log('-- Emit End');
                r.emit('end');
            }).catch(err => {
                console.log('-- Emit Error');
                r.emit('error', err);
            });

            // async iterate over our emitter
            for await (const items of on(r, 'content', { signal, close: ['end'] })) {
                for (const item of items) {
                    yield item;
                }
            }
            console.log('-- Done');
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