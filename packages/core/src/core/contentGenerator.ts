/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters
} from '@google/genai';
import { DEFAULT_MODEL } from '../config/models.js';
import { Config } from '../config/config.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
}

export type ContentGeneratorConfig = {
  model: string;
  proxy?: string | undefined;
};

export function createContentGeneratorConfig(
  config: Config,
): ContentGeneratorConfig {

  // Use runtime model from config if available; otherwise, fall back to parameter or default
  const effectiveModel = config.getModel() || DEFAULT_MODEL;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    proxy: config?.getProxy(),
  };

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig
): Promise<ContentGenerator> {

  console.log('-- Create Content Generator with config:', config);

  async function* createGenerateContentStream(
    request: GenerateContentParameters,
  ) {
    console.log('-- Create Generate Content Stream');
    const res: GenerateContentResponse = {
      codeExecutionResult: 'streamed result',
      data: 'streamed data',
      executableCode: 'streamed executable code',
      functionCalls: [],
      text: 'This is a streamed response part.',
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'This is a streamed response part.',
                thought: false,
              },
            ],
          }
        }
      ]
    };
    yield res;
  }

  // TODO: our lm studio content generator
  return {
    countTokens: async (request) => {
      console.log('-- Count Tokens');
      return {
        cachedContentTokenCount: 0,
        totalTokens: 6
      };
    },
    embedContent: async (params) => {
      console.log('-- Embed Content');
      return {

      };
    },
    generateContent: async (params) => {
      console.log('-- Generate Content');
      return {
        codeExecutionResult: 'yep',
        data: 'data',
        executableCode: 'executable code',
        functionCalls: [],
        text: 'generated text'
      }
    },
    generateContentStream: async (request) => {
      return createGenerateContentStream(request);
    }
  };
}
