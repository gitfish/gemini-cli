import { Content, ContentListUnion, CountTokensParameters, CountTokensResponse, EmbedContentParameters, EmbedContentResponse, FinishReason, GenerateContentParameters, GenerateContentResponse, Part } from "@google/genai";
import { ContentGenerator, ContentGeneratorConfig } from "../core/contentGenerator.js";
import { UserTierId } from "../code_assist/types.js";
import { LMStudioClient, LLM, Chat, ChatMessageInput, tool as lmsTool, Tool as LMSTool } from "@lmstudio/sdk";
import { partToString } from "../utils/partUtils.js";
import { Config } from '../config/config.js';
import { on, EventEmitter } from "events";
import { Tool } from "../tools/tools.js";
import { convertJsonSchemaToZod } from 'zod-from-json-schema';

/**
 * Sample responses
 * 
 * const thought: GenerateContentResponse = {
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
 * 
 */

export const createLMSTool = (t: Tool, signal: AbortSignal): LMSTool => {
    try {
        return lmsTool({
            name: t.name,
            description: t.description,
            parameters: t.schema.parametersJsonSchema ? <any>convertJsonSchemaToZod(<any>t.schema.parametersJsonSchema) : undefined,
            implementation: (params) => {
                console.log(`-- Tool call ${t.name} Params`, params)
                return t.execute(params, signal)
            }
        });
    } catch(err) {
        console.log(err);
        throw err;
    }
}

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
            console.log('-- Appending chat', userInputs[userInputs.length - 1]);
            chat.append(userInputs[userInputs.length - 1]);
        }
    };

    const generateContentStream = async (request: GenerateContentParameters, _userPromptId: string) => {
        const signal = request.config?.abortSignal;
        
        const m = await getLMSModel(request.model);

        // add tools from the registry to lms tools
        const toolRegistry = await gcConfig.getToolRegistry();

        const lmsTools: LMSTool[] = toolRegistry.getAllTools().map(t => {
            return createLMSTool(t, signal!);
        });

        console.log('-- Tool count', lmsTools.length);

        // append chats
        appendChats(request);

        const modelText = (text: string, thought?: boolean) => {
            return {
                text,
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
                                    text,
                                    thought
                                }
                            ]
                        }
                    }
                ]
            };
        };

        return async function*() {
            const r = new EventEmitter();

            m.act(chat, lmsTools, {
                signal,
                onMessage(message) {
                    console.log('-- Append model Message', JSON.stringify(message));
                    chat.append(message)
                },
                onPredictionFragment(f) {
                    console.log('-- Prediction fragment', f);
                    r.emit('content', modelText(f.content));
                },
                onToolCallRequestStart() {
                    console.log('-- On tool call request start');
                    r.emit('content', modelText('thinking about using a tool', true));
                },
                onToolCallRequestNameReceived(_roundIndex, _callId, name) {
                    console.log('-- On tool call request name received', name);
                    r.emit('content', modelText(name, true));
                },
                onToolCallRequestArgumentFragmentGenerated(_roundIndex, _callId, content) {
                    r.emit('content', modelText(content, true));
                },
                onToolCallRequestFinalized(_roundIndex, _callId, info) {
                    r.emit('content', {
                        text: info.rawContent,
                        codeExecutionResult: undefined,
                        functionCalls: [
                            {
                                id: info.toolCallRequest.id,
                                args: info.toolCallRequest.arguments,
                                name: info.toolCallRequest.name
                            }
                        ],
                        data: undefined,
                        executableCode: undefined,
                        candidates: [
                            {
                                content: {
                                    role: 'model',
                                    parts: [
                                        {
                                            text: info.rawContent,
                                            thought: false
                                        }
                                    ]
                                }
                            }
                        ]
                    });
                }
            }).then(() => {
                r.emit('end');
            }).catch(err => {
                console.error(err);
                r.emit('error', err);
            });

            // async iterate over our emitter
            for await (const items of on(r, 'content', { signal, close: ['end'] })) {
                for (const item of items) {
                    yield item;
                }
            }
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