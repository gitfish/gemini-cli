import { Content, ContentListUnion, CountTokensParameters, CountTokensResponse, EmbedContentParameters, EmbedContentResponse, FinishReason, GenerateContentParameters, GenerateContentResponse, Part, Schema, Type } from "@google/genai";
import { ContentGenerator, ContentGeneratorConfig } from "../core/contentGenerator.js";
import { UserTierId } from "../code_assist/types.js";
import { LMStudioClient, LLM, Chat, ChatMessageInput, tool as lmsTool, Tool as LMSTool } from "@lmstudio/sdk";
import { partToString } from "../utils/partUtils.js";
import { Config } from '../config/config.js';
import { on, EventEmitter } from "events";
import { Tool } from "../tools/tools.js";
import { z } from 'zod';

/**
 * Sample responses
 * 
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

const toZodObjectRaw = (s: Schema): { [key: string]: z.ZodType } => {
    const r: { [key: string]: z.ZodType } = {};
    for (const [key, value] of Object.entries(s.properties!)) {
        r[key] = toZod(value, !s.required?.includes(key) ? true : false);
    }
    return r;
};

const toZod = (s: Schema, optional?: boolean): z.ZodType => {
    const m = () => {
        if (s.type === Type.OBJECT) {
            return z.object(toZodObjectRaw(s));
        }
        if (s.type === Type.ARRAY) {
            return z.array(toZod(s.items!));
        }
        if (s.type === Type.BOOLEAN) {
            return z.boolean();
        }
        if (s.type === Type.INTEGER || s.type === Type.NUMBER) {
            return z.number();
        }
        if (s.type === Type.STRING) {
            return z.string();
        }
        throw new Error(`Unable to resolve type: ${s.type}`);
    }
    const r = m();
    if (optional) {
        r.optional();
    }

    return r;
};

export const createLMSParamSchema = (t: Tool) => {
    const paramSchema = t.schema.parameters;
    if (!paramSchema) {
        return <any>{};
    }
    return toZodObjectRaw(paramSchema);
};

export const createLMSTool = (t: Tool, signal: AbortSignal): LMSTool => {
    try {
        return lmsTool({
            name: t.name,
            description: t.description,
            parameters: createLMSParamSchema(t),
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
            modelState.p = client.llm.model(name, {
                config: {
                    contextLength: 6144
                }
            });
        }
        return modelState.p!;
    };

    const generateContent = async (request: GenerateContentParameters, userPromptId: string) => {
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

    /*
    const appendChats = async (request: GenerateContentParameters) => {
        const userInputs = getUserInputs(request);
        if (init) {
            init = false;
            if (request.config?.systemInstruction) {
                const inputs = getInputsForContents(request.config.systemInstruction);
                console.log('-- System instruction inputs', JSON.stringify(inputs, null, 2));
                for (const input of inputs) {
                    chat.append('user', input.content!);
                }
            }
            // we also append all user inputs
            for (const userInput of userInputs) {
                chat.append(userInput);
            }
        } else {
            console.log('-- Appending chat', userInputs[userInputs.length - 1]);
            chat.append(userInputs[userInputs.length - 1]);
        }
    };
    */

    const generateContentStream = async (request: GenerateContentParameters, _userPromptId: string) => {
        const signal = request.config?.abortSignal;
        
        const m = await getLMSModel(request.model);

        // add tools from the registry to lms tools
        const toolRegistry = await gcConfig.getToolRegistry();

        const lmsTools: LMSTool[] = toolRegistry.getAllTools().map(t => {
            return createLMSTool(t, signal!);
        });

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

            const asyncIterator = on(r, 'content', { signal, close: ['end'] });

            const createEvents = async () => {

                const userInputs = getUserInputs(request);

                const chatInit = async (input: ChatMessageInput) => {
                    chat.append(input);
                    for await (const { content } of m.respond(chat, { signal })) {
                        r.emit('content', modelText(content));
                    }
                };

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

                    if (userInputs.length > 1) {
                        for (const userInput of userInputs.slice(0, userInputs.length - 1)) {
                            await chatInit(userInput);
                        }
                    }
                }

                chat.append(userInputs[userInputs.length - 1]);

                await m.act(chat, lmsTools, {
                    signal,
                    onMessage(message) {
                        chat.append(message);
                    },
                    onPredictionFragment(f) {
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
                    onToolCallRequestDequeued(_roundIndex, _callId) {
                        console.log('-- On Tool Call Request Dequeued');
                    },
                    onToolCallRequestFinalized(_roundIndex, _callId, info) {
                        console.log('-- On tool request finalized', info);
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
                    },
                    onToolCallRequestFailure(_roundIndex, _callId, error) {
                        console.log('-- On Tool Call Request Failure', error);
                    }
                });
            };

            createEvents().then(() => {
                r.emit('end');
            }).catch(err => {
                r.emit('error', err);
            });

            // async iterate over our emitter
            for await (const items of asyncIterator) {
                for (const item of items) {
                    yield item;
                }
            }
        }();
    };

    const countTokens = async (request: CountTokensParameters): Promise<CountTokensResponse> => {
        // Simulate token counting
        return {
            cachedContentTokenCount: 0,
            totalTokens: 0,
        };
    };

    const embedContent = async (request: EmbedContentParameters): Promise<EmbedContentResponse> => {
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